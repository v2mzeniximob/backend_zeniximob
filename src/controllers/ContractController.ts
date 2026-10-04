import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient() as any;

export class ContractController {
  
  // 1. CRIAR CONTRATO (LOCAÇÃO OU VENDA) E GERAR FATURAS/PARCELAS
  async create(req: Request, res: Response) {
    try {
      const user = req.user as any;
      const realEstateId = user?.realEstateId || user?.id;
      if (!realEstateId) return res.status(403).json({ error: 'Acesso negado.' });

      // Adicionamos depositValue e depositDate no recebimento do body
      const { type, propertyId, tenantId, startDate, endDate, rentValue, adminFeePercent, readjustmentIndex, documentUrl, depositValue, depositDate } = req.body;
      
      if (!propertyId) return res.status(400).json({ error: 'Imóvel é obrigatório.' });
      if (!tenantId) return res.status(400).json({ error: 'Cliente é obrigatório.' });

      const contractType = type || 'Locação';
      const isSale = contractType === 'Venda';

      // ==========================================================
      // NOVA TRAVA: VERIFICAÇÃO DE PROPOSTA ACEITA
      // ==========================================================
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

      // Trava de Segurança: Impede dois contratos ativos no mesmo imóvel
      const activeContract = await prisma.contract.findFirst({
        where: { propertyId: propertyId, status: 'Ativo' }
      });

      if (activeContract) {
        return res.status(400).json({ error: 'Este imóvel já possui um contrato ativo ou já foi vendido.' });
      }

      // Cria o Contrato salvando também os dados do Caução
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

      // ==========================================================
      // A MAGIA DA AUTOMAÇÃO: Diferencia Venda vs Locação
      // ==========================================================
      await prisma.client.update({
        where: { id: tenantId },
        data: isSale ? { isBuyer: true } : { isTenant: true }
      });

      // Atualiza o Status do Imóvel
      await prisma.property.update({ 
        where: { id: propertyId }, 
        data: { 
          rentStatus: isSale ? 'Vendido' : 'Alugado', 
          tenantId: tenantId 
        } 
      });

      // ==========================================================
      // GERAÇÃO DE FATURAS (Caução + Boletos de Aluguel/Venda)
      // ==========================================================
      
      // 1. GERAÇÃO DA FATURA DE CAUÇÃO (Se for locação e tiver valor preenchido)
      if (depositValue && Number(depositValue) > 0 && depositDate) {
        try {
          await prisma.invoice.create({
            data: {
              contractId: contract.id,
              totalAmount: Number(depositValue),
              realEstateFee: 0, // Caução não tem desconto de taxa administrativa
              ownerAmount: Number(depositValue),
              dueDate: new Date(depositDate),
              status: 'Pendente',
              description: 'Caução' // Título amigável da Fatura
            }
          });
        } catch (caucaoError) {
          console.error('Falha ao gerar Caução:', caucaoError);
        }
      }

      // 2. GERAÇÃO DAS PARCELAS RECORRENTES (Aluguel ou Venda)
      if (startDate && rentValue) {
        const start = new Date(startDate);
        // Se for Venda e não tiver data de fim, gera 1 parcela só (o Início = Fim)
        const end = endDate ? new Date(endDate) : new Date(startDate); 
        const rentNumber = parseFloat(rentValue.toString().replace(',', '.'));
        
        // Cálculos Financeiros (Comissão da Imobiliária vs Repasse ao Dono)
        const adminFee = adminFeePercent ? (rentNumber * (Number(adminFeePercent) / 100)) : 0;
        const repasse = rentNumber - adminFee;

        if (start <= end && !isNaN(rentNumber)) {
          let currentMonth = new Date(start);
          
          // O Loop roda 1 vez para Vendas, ou "X" vezes para meses de Locação
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
                  description: isSale ? 'Parcela de Venda' : 'Aluguel Mensal' // Adicionado o campo description
                }
              });
            } catch (invoiceError) {
              console.error('Falha ao gerar parcela:', invoiceError);
            }
            // Avança 1 mês para a próxima parcela
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

  // 2. LISTAR CONTRATOS (COM FATURAS E VISTORIAS)
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
          tenant: { select: { name: true, document: true, clientType: true } },
          invoices: { orderBy: { dueDate: 'asc' } },
          inspections: true
        },
        orderBy: { createdAt: 'desc' }
      });

      // Formata a resposta para o frontend
      const mappedContracts = contracts.map((c: any) => {
        if (c.invoices) {
           c.invoices = c.invoices.map((inv: any, index: number) => ({
              ...inv,
              amount: inv.totalAmount,
              // Mantém o título "Caução" se vier do banco, caso contrário formata normal
              description: inv.description || (c.type === 'Venda' ? `Parcela Única / Sinal` : `Aluguel - Parcela ${index + 1}`)
           }));
        }
        return c;
      });

      return res.json(mappedContracts);
    } catch (error) { 
      console.error(error);
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

      // Se o contrato for encerrado/rescindido, devolvemos o imóvel para "Vago/Disponível"
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
      const { id } = req.params; // contractId
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

      // Exclui as faturas vinculadas primeiro para evitar erro de restrição de chave estrangeira (Foreign Key Constraint)
      await prisma.invoice.deleteMany({ where: { contractId: id } });
      
      // Exclui o contrato (as vistorias são apagadas automaticamente pelo Cascade)
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