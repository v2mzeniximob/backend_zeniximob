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

      // Trava de Segurança: Impede dois contratos ativos no mesmo imóvel
      const activeContract = await prisma.contract.findFirst({
        where: { propertyId: propertyId, status: 'Ativo' }
      });

      if (activeContract) {
        return res.status(400).json({ error: 'Este imóvel já possui um contrato ativo. Encerre ou cancele o atual.' });
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

      // ==========================================================
      // A MAGIA DA AUTOMAÇÃO: Promove o Cliente a Inquilino
      // ==========================================================
      if (tenantId) {
        await prisma.client.update({
          where: { id: tenantId },
          data: { isTenant: true }
        });
      }

      // Atualiza o imóvel para Alugado
      if (contract.type === 'Locação') {
        await prisma.property.update({ 
          where: { id: propertyId }, 
          data: { rentStatus: 'Alugado', tenantId: tenantId || null } 
        });
      }

      // GERAÇÃO DE FATURAS EXATAMENTE DE ACORDO COM O SCHEMA
      if (startDate && endDate && rentValue) {
        const start = new Date(startDate);
        const end = new Date(endDate);
        const rentNumber = parseFloat(rentValue.toString().replace(',', '.'));
        
        // Cálculos Financeiros
        const adminFee = adminFeePercent ? (rentNumber * (Number(adminFeePercent) / 100)) : 0;
        const repasse = rentNumber - adminFee;

        if (start <= end && !isNaN(rentNumber)) {
          let currentMonth = new Date(start);
          
          while (currentMonth <= end) {
            try {
              await prisma.invoice.create({
                data: {
                  contractId: contract.id,
                  totalAmount: rentNumber,    // Campo oficial do DB
                  realEstateFee: adminFee,    // Campo oficial do DB
                  ownerAmount: repasse,       // Campo oficial do DB
                  dueDate: new Date(currentMonth),
                  status: 'Pendente'
                }
              });
            } catch (invoiceError) {
              console.error('Falha ao gerar parcela:', invoiceError);
            }
            currentMonth.setMonth(currentMonth.getMonth() + 1);
          }
        }
      }

      return res.status(201).json(contract);
    } catch (error) { 
      console.error(error);
      return res.status(500).json({ error: 'Erro ao gerar contrato e faturas.' }); 
    }
  }

  // 2. LISTAR CONTRATOS (COM AS FATURAS PARA O PAINEL FINANCEIRO)
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
          tenant: { select: { name: true, document: true, cpf: true, email: true, phone: true } },
          invoices: { orderBy: { dueDate: 'asc' } }, // CARREGA AS FATURAS PARA O FINANCEIRO
          inspections: true
        },
        orderBy: { createdAt: 'desc' }
      });

      // MAPEAMENTO MÁGICO: Transforma dados do DB no formato que o Frontend espera
      const mappedContracts = contracts.map((c: any) => {
        if (c.invoices) {
           c.invoices = c.invoices.map((inv: any, index: number) => ({
              ...inv,
              amount: inv.totalAmount, // O Frontend precisa da palavra 'amount'
              description: `Aluguel - Parcela ${index + 1}` // O Frontend precisa da palavra 'description'
           }));
        }
        
        // Remove os "fantasmas" da ZapSign da resposta da API
        delete c.signatureProvider;
        delete c.signedDocumentUrl;
        delete c.externalDocToken;
        delete c.signUrl;
        delete c.signerEmail;
        delete c.signatureStatus;

        return c;
      });

      return res.json(mappedContracts);
    } catch (error) { 
      console.error(error);
      return res.status(500).json({ error: 'Erro ao listar contratos.' }); 
    }
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
    } catch (error) { 
      console.error(error);
      return res.status(500).json({ error: 'Erro ao atualizar.' }); 
    }
  }
  
  // 4. ADICIONAR VISTORIA
  async addInspection(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { type, date, reportUrl } = req.body;
      const inspection = await prisma.inspection.create({ data: { contractId: id, type: type || 'Rotina', date: new Date(date), reportUrl } });
      return res.status(201).json(inspection);
    } catch (error) { 
      console.error(error);
      return res.status(500).json({ error: 'Erro ao registar vistoria.' }); 
    }
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
    } catch (error) { 
      console.error(error);
      return res.status(500).json({ error: 'Erro ao cancelar o contrato.' }); 
    }
  }
}