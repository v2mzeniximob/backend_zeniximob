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

      // TRAVA DE SEGURANÇA
      const activeContract = await prisma.contract.findFirst({
        where: { propertyId: propertyId, status: 'Ativo' }
      });

      if (activeContract) {
        return res.status(400).json({ error: 'Este imóvel já possui um contrato ativo. Encerre ou cancele o contrato atual.' });
      }

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

      // GERAÇÃO AUTOMÁTICA DE FATURAS ALINHADA COM O SEU SCHEMA
      if (startDate && endDate && rentValue) {
        const start = new Date(startDate);
        const end = new Date(endDate);
        const rentNumber = parseFloat(rentValue.toString().replace(',', '.'));
        
        // Cálculos Financeiros Base
        const adminFee = adminFeePercent ? (rentNumber * (Number(adminFeePercent) / 100)) : 0;
        const repasse = rentNumber - adminFee;

        if (start <= end && !isNaN(rentNumber)) {
          let currentMonth = new Date(start);
          let installment = 1;

          while (currentMonth <= end) {
            try {
              await prisma.invoice.create({
                data: {
                  contractId: contract.id,
                  totalAmount: rentNumber, // NOVO (De acordo com o seu schema)
                  realEstateFee: adminFee, // NOVO
                  ownerAmount: repasse, // NOVO
                  dueDate: new Date(currentMonth),
                  status: 'Pendente'
                }
              });
            } catch (invoiceError) {
              console.error('Falha ao gerar parcela', installment, invoiceError);
            }
            
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

  // 2. LISTAR CONTRATOS (SEM SOBRAS DA ZAPSIGN)
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

      const contract = await prisma.contract.findUnique({ where: { id }, include: { property: true } });
      if (!contract || contract.property.realEstateId !== realEstateId) return res.status(404).json({ error: 'Contrato não encontrado.' });

      const updated = await prisma.contract.update({ 
        where: { id }, 
        data: { 
          status, documentUrl, propertyId: propertyId || undefined, tenantId: tenantId || undefined,
          startDate: startDate ? new Date(startDate) : undefined, rentValue: rentValue ? Number(rentValue) : undefined,
          adminFeePercent: adminFeePercent ? Number(adminFeePercent) : undefined, readjustmentIndex: readjustmentIndex || undefined
        } 
      });

      if (status === 'Encerrado' && contract.type === 'Locação') {
        await prisma.property.update({ where: { id: contract.propertyId }, data: { rentStatus: 'Vago', tenantId: null } });
      }
      return res.json(updated);
    } catch (error) { return res.status(500).json({ error: 'Erro ao atualizar contrato.' }); }
  }
  
  // 4. ADICIONAR VISTORIA
  async addInspection(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { type, date, reportUrl } = req.body;
      const inspection = await prisma.inspection.create({ data: { contractId: id, type: type || 'Rotina', date: new Date(date), reportUrl } });
      return res.status(201).json(inspection);
    } catch (error) { return res.status(500).json({ error: 'Erro ao registar vistoria.' }); }
  }

  // 5. APAGAR CONTRATO E FATURAS
  async delete(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const contract = await prisma.contract.findUnique({ where: { id } });
      if (!contract) return res.status(404).json({ error: 'Contrato não encontrado.' });

      await prisma.invoice.deleteMany({ where: { contractId: id } });

      if (contract.propertyId) {
        await prisma.property.update({ where: { id: contract.propertyId }, data: { rentStatus: 'Vago', tenantId: null } });
      }
      await prisma.contract.delete({ where: { id } });
      return res.json({ message: 'Contrato cancelado com sucesso.' });
    } catch (error) { return res.status(500).json({ error: 'Erro ao cancelar o contrato.' }); }
  }
}