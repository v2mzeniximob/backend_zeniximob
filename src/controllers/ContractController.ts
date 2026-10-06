import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient() as any;

export class ContractController {
  
  // 1. CRIAR CONTRATO (LOCAÇÃO OU VENDA), GERAR FATURAS E ATUALIZAR CRM
  async create(req: Request, res: Response) {
    try {
      const user = req.user as any;
      const realEstateId = user?.realEstateId || user?.id;
      if (!realEstateId) return res.status(403).json({ error: 'Acesso negado.' });

      const { type, propertyId, tenantId, startDate, endDate, rentValue, adminFeePercent, readjustmentIndex, documentUrl, depositValue, depositDate } = req.body;
      
      if (!propertyId) return res.status(400).json({ error: 'Imóvel é obrigatório.' });
      if (!tenantId) return res.status(400).json({ error: 'Cliente é obrigatório.' });

      const contractType = type || 'Locação';
      const isSale = contractType === 'Venda';

      const acceptedProposal = await prisma.proposal.findFirst({
        where: {
          propertyId: propertyId,
          clientId: tenantId,
          type: contractType,
          status: 'Aceita'
        }
      });

      if (!acceptedProposal) {
        return res.status(400).json({ 
          error: `Para gerar este contrato, é obrigatório ter uma Proposta de ${contractType} com status "Aceita" vinculada a este imóvel e cliente no sistema.` 
        });
      }

      const activeContract = await prisma.contract.findFirst({
        where: { propertyId: propertyId, status: 'Ativo' }
      });

      if (activeContract) {
        return res.status(400).json({ error: 'Este imóvel já possui um contrato ativo ou já foi vendido.' });
      }

      // CRIA O CONTRATO
      const contract = await prisma.contract.create({
        data: {
          type: contractType, 
          status: 'Ativo', 
          propertyId, 
          tenantId,
          startDate: new Date(startDate), 
          endDate: endDate ? new Date(endDate) : null,
          rentValue: Number(rentValue), 
          adminFeePercent: Number(adminFeePercent || 0), 
          readjustmentIndex, 
          depositValue: depositValue ? Number(depositValue) : 0,
          depositDate: depositDate ? new Date(depositDate) : null,
          documentUrl
        }
      });

      // ATUALIZA O CLIENTE PARA INQUILINO OU COMPRADOR
      await prisma.client.update({
        where: { id: tenantId },
        data: isSale ? { isBuyer: true } : { isTenant: true }
      });

      // ATUALIZA O STATUS DO IMÓVEL
      await prisma.property.update({ 
        where: { id: propertyId }, 
        data: { 
          rentStatus: isSale ? 'Vendido' : 'Alugado', 
          tenantId: tenantId 
        } 
      });

      // ==========================================
      // AUTOMAÇÃO DO CRM: MOVER CARD PARA "FECHADO"
      // ==========================================
      try {
        await prisma.lead.updateMany({
          where: {
            clientId: tenantId,
            propertyId: propertyId 
          },
          data: {
            status: 'Fechado' // O card vai automaticamente para a coluna "Fechado"
          }
        });
        console.log(`Lead do cliente movido para 'Fechado' com sucesso no CRM.`);
      } catch (crmError) {
        console.error('Aviso: Erro ao mover lead no funil do CRM:', crmError);
      }
      // ==========================================

      // GERAÇÃO DA FATURA DE CAUÇÃO (SE HOUVER)
      if (depositValue && Number(depositValue) > 0 && depositDate) {
        try {
          await prisma.invoice.create({
            data: {
              contractId: contract.id,
              totalAmount: Number(depositValue),
              realEstateFee: 0,
              ownerAmount: Number(depositValue),
              dueDate: new Date(depositDate),
              status: 'Pendente',
              description: 'Caução' 
            }
          });
        } catch (caucaoError) {
          console.error('Falha ao gerar Caução:', caucaoError);
        }
      }

      // GERAÇÃO DAS PARCELAS RECORRENTES (ALUGUEL OU PARCELA DE VENDA)
      if (startDate && rentValue) {
        const start = new Date(startDate);
        const end = endDate ? new Date(endDate) : new Date(startDate); 
        const rentNumber = parseFloat(rentValue.toString().replace(',', '.'));
        
        const adminFee = adminFeePercent ? (rentNumber * (Number(adminFeePercent) / 100)) : 0;
        const repasse = rentNumber - adminFee;

        if (start <= end && !isNaN(rentNumber)) {
          let currentMonth = new Date(start);
          
          while (currentMonth <= end) {
            try {
              await prisma.invoice.create({
                data: {
                  contractId: contract.id,
                  totalAmount: rentNumber,
                  realEstateFee: adminFee,
                  ownerAmount: repasse,
                  dueDate: new Date(currentMonth),
                  status: 'Pendente',
                  description: isSale ? 'Parcela de Venda' : 'Aluguel Mensal' 
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

  // 2. LISTAR CONTRATOS (COM DADOS CORRETOS DO CLIENTE PARA O FINANCEIRO)
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
          // Inclui os contatos do cliente sem quebrar a busca
          tenant: { select: { name: true, document: true, clientType: true, email: true, phone: true, corporateName: true } },
          invoices: { orderBy: { dueDate: 'asc' } },
          inspections: true
        },
        orderBy: { createdAt: 'desc' }
      });

      const mappedContracts = contracts.map((c: any) => {
        if (c.invoices) {
           c.invoices = c.invoices.map((inv: any, index: number) => ({
              ...inv,
              amount: inv.totalAmount,
              description: inv.description || (c.type === 'Venda' ? `Parcela Única / Sinal` : `Aluguel - Parcela ${index + 1}`)
           }));
        }
        return c;
      });

      return res.json(mappedContracts);
    } catch (error) { 
      console.error('Erro detalhado no backend:', error);
      return res.status(500).json({ error: 'Erro ao listar contratos.' }); 
    }
  }

  // 3. ATUALIZAR E ENCERRAR CONTRATO
  async update(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { status } = req.body;

      const contract = await prisma.contract.update({ 
        where: { id }, 
        data: { status },
        include: { property: true }
      });

      // Se o contrato acabar, o imóvel volta a ficar vago automaticamente
      if (status === 'Encerrado' || status === 'Rescindido') {
        await prisma.property.update({ 
          where: { id: contract.propertyId }, 
          data: { rentStatus: 'Vago', tenantId: null } 
        });
      }

      return res.json(contract);
    } catch (error) { 
      return res.status(500).json({ error: 'Erro ao atualizar contrato.' }); 
    }
  }

  // 4. ADICIONAR VISTORIA (INSPECTION)
  async addInspection(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { type, date, reportUrl } = req.body;

      const inspection = await prisma.inspection.create({
        data: {
          contractId: id,
          type: type || 'Rotina',
          date: date ? new Date(date) : new Date(),
          reportUrl
        }
      });

      return res.status(201).json(inspection);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao adicionar vistoria.' });
    }
  }

  // 5. DELETAR CONTRATO (E EXCLUIR FATURAS)
  async delete(req: Request, res: Response) {
    try {
      const { id } = req.params;

      const contract = await prisma.contract.findUnique({ where: { id } });
      if (!contract) {
        return res.status(404).json({ error: 'Contrato não encontrado.' });
      }

      // Exclui as faturas vinculadas primeiro
      await prisma.invoice.deleteMany({ where: { contractId: id } });
      await prisma.contract.delete({ where: { id } });

      // Libera o imóvel
      await prisma.property.update({
        where: { id: contract.propertyId },
        data: { rentStatus: 'Vago', tenantId: null }
      });

      return res.json({ message: 'Contrato excluído com sucesso.' });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao excluir contrato.' });
    }
  }
}