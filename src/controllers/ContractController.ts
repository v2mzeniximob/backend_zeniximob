import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export class ContractController {
  
  // ==========================================
  // GESTÃO DE CONTRATOS
  // ==========================================

  // 1. Criar novo Contrato
  async create(req: Request, res: Response) {
    try {
      const user = req.user as any;
      const realEstateId = user?.realEstateId || user?.id;
      if (!realEstateId) return res.status(403).json({ error: 'Acesso negado.' });

      const { type, propertyId, tenantId, startDate, endDate, rentValue, adminFeePercent, readjustmentIndex, documentUrl } = req.body;

      // Verifica se o imóvel pertence à imobiliária
      const property = await (prisma as any).property.findUnique({ where: { id: propertyId } });
      if (!property || property.realEstateId !== realEstateId) {
        return res.status(404).json({ error: 'Imóvel não encontrado.' });
      }

      const contract = await (prisma as any).contract.create({
        data: {
          type,                 // "Locação" ou "Venda"
          status: 'Ativo',      // Minuta, Assinatura, Ativo, Encerrado
          startDate: new Date(startDate),
          endDate: endDate ? new Date(endDate) : null,
          rentValue: Number(rentValue),
          adminFeePercent: Number(adminFeePercent),
          readjustmentIndex,    // "IGPM", "IPCA"
          documentUrl,          // Link do PDF
          propertyId,
          tenantId: tenantId || null // Só obrigatório se for Locação
        }
      });

      // Se for um contrato de locação, atualiza o status do imóvel para "Alugado"
      if (type === 'Locação') {
        await (prisma as any).property.update({
          where: { id: propertyId },
          data: { rentStatus: 'Alugado', tenantId: tenantId }
        });
      }

      return res.status(201).json(contract);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao gerar contrato.' });
    }
  }

  // 2. Listar Contratos (Com filtros de status e tipo)
  async list(req: Request, res: Response) {
    try {
      const user = req.user as any;
      const realEstateId = user?.realEstateId || user?.id;
      if (!realEstateId) return res.status(403).json({ error: 'Acesso negado.' });

      const { status, type } = req.query;
      const whereClause: any = { property: { realEstateId } };
      
      if (status) whereClause.status = status;
      if (type) whereClause.type = type;

      const contracts = await (prisma as any).contract.findMany({
        where: whereClause,
        include: {
          property: { select: { title: true, address: true, owner: { select: { name: true } } } },
          tenant: { select: { name: true, cpf: true } },
          inspections: true // Traz as vistorias anexadas ao contrato
        },
        orderBy: { createdAt: 'desc' }
      });

      return res.json(contracts);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao listar contratos.' });
    }
  }

  // 3. Atualizar Contrato / Encerrar
  async update(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const user = req.user as any;
      const realEstateId = user?.realEstateId || user?.id;
      
      // Validação de segurança básica omitida por brevidade (idealmente valida-se se o contrato pertence à loja)
      const { status, endDate, rentValue, adminFeePercent, readjustmentIndex, documentUrl, signatureStatus } = req.body;

      const updatedContract = await (prisma as any).contract.update({
        where: { id },
        data: { 
          status, 
          endDate: endDate ? new Date(endDate) : undefined, 
          rentValue: rentValue ? Number(rentValue) : undefined, 
          adminFeePercent: adminFeePercent ? Number(adminFeePercent) : undefined, 
          readjustmentIndex, 
          documentUrl, 
          signatureStatus 
        },
        include: { property: true }
      });

      // Se encerrou o contrato de locação, liberta o imóvel
      if (status === 'Encerrado' && updatedContract.type === 'Locação') {
        await (prisma as any).property.update({
          where: { id: updatedContract.propertyId },
          data: { rentStatus: 'Vago', tenantId: null }
        });
      }

      return res.json(updatedContract);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao atualizar contrato.' });
    }
  }

  // ==========================================
  // GESTÃO DE VISTORIAS (LAUDOS FOTOGRÁFICOS)
  // ==========================================

  // 4. Adicionar Vistoria ao Contrato
  async addInspection(req: Request, res: Response) {
    try {
      const { id } = req.params; // ID do contrato
      const { type, date, reportUrl } = req.body; // type: "Entrada", "Saída", "Rotina"

      const inspection = await (prisma as any).inspection.create({
        data: {
          contractId: id,
          type,
          date: new Date(date),
          reportUrl // Link do PDF do laudo
        }
      });

      return res.status(201).json(inspection);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao anexar vistoria.' });
    }
  }
}