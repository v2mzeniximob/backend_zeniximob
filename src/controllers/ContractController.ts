import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient() as any;

export class ContractController {
  
  // 1. CRIAR CONTRATO
  async create(req: Request, res: Response) {
    try {
      const user = req.user as any;
      const realEstateId = user?.realEstateId || user?.id;
      if (!realEstateId) return res.status(403).json({ error: 'Acesso negado.' });

      const {
        type, propertyId, tenantId, startDate, endDate, rentValue, adminFeePercent, readjustmentIndex, documentUrl
      } = req.body;

      if (!propertyId) return res.status(400).json({ error: 'Imóvel é obrigatório.' });

      // Verifica se o imóvel pertence à imobiliária
      const property = await prisma.property.findFirst({
        where: { id: propertyId, realEstateId }
      });

      if (!property) return res.status(404).json({ error: 'Imóvel não encontrado.' });

      const contract = await prisma.contract.create({
        data: {
          type: type || 'Locação',
          status: 'Ativo',
          propertyId,
          tenantId: tenantId || null,
          startDate: new Date(startDate),
          endDate: endDate ? new Date(endDate) : null,
          rentValue: Number(rentValue),
          adminFeePercent: Number(adminFeePercent),
          readjustmentIndex,
          documentUrl
        }
      });

      // Se for um contrato de locação, atualizamos o imóvel para "Alugado"
      if (contract.type === 'Locação') {
        await prisma.property.update({
          where: { id: propertyId },
          data: { rentStatus: 'Alugado', tenantId: tenantId || null }
        });
      }

      return res.status(201).json(contract);
    } catch (error) {
      console.error('Erro ao gerar contrato:', error);
      return res.status(500).json({ error: 'Erro ao gerar contrato.' });
    }
  }

  // 2. LISTAR CONTRATOS
  async list(req: Request, res: Response) {
    try {
      const user = req.user as any;
      const realEstateId = user?.realEstateId || user?.id;
      if (!realEstateId) return res.status(403).json({ error: 'Acesso negado.' });

      const status = req.query.status as string;

      // O SEGREDO DO ERRO ESTAVA AQUI: Procurar o realEstateId através da tabela de Imóveis
      const whereClause: any = {
        property: { realEstateId }
      };

      if (status) {
        whereClause.status = status;
      }

      const contracts = await prisma.contract.findMany({
        where: whereClause,
        include: {
          property: {
            select: { title: true, address: true, owner: { select: { name: true } } }
          },
          tenant: { select: { name: true, cpf: true } },
          inspections: true // Traz os laudos de vistoria atrelados ao contrato
        },
        orderBy: { createdAt: 'desc' }
      });

      return res.json(contracts);
    } catch (error) {
      console.error('Erro ao listar contratos:', error);
      return res.status(500).json({ error: 'Erro ao listar contratos.' });
    }
  }

  // 3. ATUALIZAR CONTRATO (Ex: Encerrar)
  async update(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { status, documentUrl } = req.body;
      const user = req.user as any;
      const realEstateId = user?.realEstateId || user?.id;

      const contract = await prisma.contract.findUnique({
        where: { id },
        include: { property: true }
      });

      if (!contract || contract.property.realEstateId !== realEstateId) {
         return res.status(404).json({ error: 'Contrato não encontrado.' });
      }

      const updated = await prisma.contract.update({
        where: { id },
        data: { status, documentUrl }
      });

      // Se o contrato for encerrado, devolve o imóvel para o status de "Vago"
      if (status === 'Encerrado' && contract.type === 'Locação') {
        await prisma.property.update({
          where: { id: contract.propertyId },
          data: { rentStatus: 'Vago', tenantId: null }
        });
      }

      return res.json(updated);
    } catch (error) {
      console.error('Erro ao atualizar contrato:', error);
      return res.status(500).json({ error: 'Erro ao atualizar contrato.' });
    }
  }

  // 4. ADICIONAR VISTORIA (App do Corretor)
  async addInspection(req: Request, res: Response) {
    try {
      const { id } = req.params; // ID do contrato
      const { type, date, reportUrl } = req.body;
      const user = req.user as any;
      const realEstateId = user?.realEstateId || user?.id;

      const contract = await prisma.contract.findUnique({
        where: { id },
        include: { property: true }
      });

      if (!contract || contract.property.realEstateId !== realEstateId) {
         return res.status(404).json({ error: 'Contrato não encontrado.' });
      }

      const inspection = await prisma.inspection.create({
        data: {
          contractId: id,
          type: type || 'Rotina',
          date: new Date(date),
          reportUrl
        }
      });

      return res.status(201).json(inspection);
    } catch (error) {
      console.error('Erro ao registar vistoria:', error);
      return res.status(500).json({ error: 'Erro ao registar vistoria.' });
    }
  }
}