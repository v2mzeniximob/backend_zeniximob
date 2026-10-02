import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient() as any;

export class ContractController {
  
  // 1. CRIAR CONTRATO E GERAR FATURAS
  async create(req: Request, res: Response) {
    try {
      const user = req.user as any;
      const realEstateId = user?.realEstateId || user?.id;
      if (!realEstateId) return res.status(403).json({ error: 'Acesso negado.' });

      const { type, propertyId, tenantId, startDate, endDate, rentValue, adminFeePercent, readjustmentIndex, documentUrl } = req.body;
      if (!propertyId) return res.status(400).json({ error: 'Imóvel é obrigatório.' });

      const property = await prisma.property.findFirst({ where: { id: propertyId, realEstateId } });
      if (!property) return res.status(404).json({ error: 'Imóvel não encontrado.' });

      // Cria o Contrato
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

      // Atualiza o imóvel para Alugado
      if (contract.type === 'Locação') {
        await prisma.property.update({ 
          where: { id: propertyId }, 
          data: { rentStatus: 'Alugado', tenantId: tenantId || null } 
        });
      }

      // GERAÇÃO AUTOMÁTICA DE FATURAS (INVOICES) SEGURO
      if (startDate && endDate && rentValue) {
        const start = new Date(startDate);
        const end = new Date(endDate);
        // Garante que o valor é lido corretamente mesmo que tenha vírgulas
        const rentNumber = parseFloat(rentValue.toString().replace(',', '.'));

        if (start <= end && !isNaN(rentNumber)) {
          let currentMonth = new Date(start);
          let installment = 1;

          // Cria as faturas UMA a UMA para evitar erros de banco de dados
          while (currentMonth <= end) {
            await prisma.invoice.create({
              data: {
                contractId: contract.id,
                realEstateId: realEstateId,
                description: `Aluguel - Parcela ${installment}`,
                amount: rentNumber,
                dueDate: new Date(currentMonth),
                status: 'Pendente'
              }
            });
            currentMonth.setMonth(currentMonth.getMonth() + 1);
            installment++;
          }
        }
      }

      return res.status(201).json(contract);
    } catch (error) { 
      console.error('Erro ao gerar contrato:', error);
      return res.status(500).json({ error: 'Erro ao gerar contrato e faturas.' }); 
    }
  }

  // 2. LISTAR CONTRATOS
  async list(req: Request, res: Response) {
    try {
      const user = req.user as any;
      const realEstateId = user?.realEstateId || user?.id;
      if (!realEstateId) return res.status(403).json({ error: 'Acesso negado.' });

      const status = req.query.status as string;
      const whereClause: any = { property: { realEstateId } };
      if (status) whereClause.status = status;

      const contracts = await prisma.contract.findMany({
        where: whereClause,
        include: {
          property: { select: { title: true, address: true, owner: { select: { name: true } } } },
          tenant: { select: { name: true, cpf: true, email: true, phone: true } },
          inspections: true
        },
        orderBy: { createdAt: 'desc' }
      });

      return res.json(contracts);
    } catch (error) { return res.status(500).json({ error: 'Erro ao listar contratos.' }); }
  }

  // 3. ATUALIZAR CONTRATO
  async update(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { status, documentUrl, propertyId, tenantId, startDate, rentValue, adminFeePercent, readjustmentIndex } = req.body;
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
        data: { 
          status, 
          documentUrl,
          propertyId: propertyId || undefined,
          tenantId: tenantId || undefined,
          startDate: startDate ? new Date(startDate) : undefined,
          rentValue: rentValue ? Number(rentValue) : undefined,
          adminFeePercent: adminFeePercent ? Number(adminFeePercent) : undefined,
          readjustmentIndex: readjustmentIndex || undefined
        } 
      });

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
  
  // 4. ADICIONAR VISTORIA
  async addInspection(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { type, date, reportUrl } = req.body;
      const user = req.user as any;
      const realEstateId = user?.realEstateId || user?.id;

      const contract = await prisma.contract.findUnique({ where: { id }, include: { property: true } });
      if (!contract || contract.property.realEstateId !== realEstateId) return res.status(404).json({ error: 'Contrato não encontrado.' });

      const inspection = await prisma.inspection.create({ data: { contractId: id, type: type || 'Rotina', date: new Date(date), reportUrl } });
      return res.status(201).json(inspection);
    } catch (error) { return res.status(500).json({ error: 'Erro ao registar vistoria.' }); }
  }

  // 5. APAGAR CONTRATO
  async delete(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const contract = await prisma.contract.findUnique({ where: { id } });
      if (!contract) return res.status(404).json({ error: 'Contrato não encontrado.' });

      await prisma.invoice.deleteMany({ where: { contractId: id } });

      if (contract.propertyId) {
        await prisma.property.update({
          where: { id: contract.propertyId },
          data: { rentStatus: 'Vago', tenantId: null }
        });
      }
      await prisma.contract.delete({ where: { id } });

      return res.json({ message: 'Contrato cancelado, faturas removidas e imóvel libertado com sucesso.' });
    } catch (error) {
      console.error('Erro ao cancelar contrato:', error);
      return res.status(500).json({ error: 'Erro ao cancelar o contrato.' });
    }
  }
}