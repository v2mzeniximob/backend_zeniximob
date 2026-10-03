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

      const { type, propertyId, tenantId, startDate, endDate, rentValue, adminFeePercent, readjustmentIndex, documentUrl } = req.body;
      if (!propertyId) return res.status(400).json({ error: 'Imóvel é obrigatório.' });

      const isSale = type === 'Venda';

      // Trava de Segurança: Impede dois contratos ativos no mesmo imóvel (a menos que já tenha sido vendido, aí não pode alugar)
      const activeContract = await prisma.contract.findFirst({
        where: { propertyId: propertyId, status: 'Ativo' }
      });

      if (activeContract) {
        return res.status(400).json({ error: 'Este imóvel já possui um contrato ativo ou já foi vendido.' });
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
          adminFeePercent: Number(adminFeePercent || 0), 
          readjustmentIndex, 
          documentUrl
        }
      });

      // ==========================================================
      // A MAGIA DA AUTOMAÇÃO: Diferencia Venda vs Locação
      // ==========================================================
      if (tenantId) {
        await prisma.client.update({
          where: { id: tenantId },
          data: isSale ? { isBuyer: true } : { isTenant: true }
        });
      }

      // Atualiza o Status do Imóvel
      await prisma.property.update({ 
        where: { id: propertyId }, 
        data: { 
          rentStatus: isSale ? 'Vendido' : 'Alugado', 
          tenantId: tenantId || null 
        } 
      });

      // GERAÇÃO DE FATURAS (Boletos de Aluguel OU Parcelas da Venda)
      if (startDate && rentValue) {
        const start = new Date(startDate);
        const end = endDate ? new Date(endDate) : new Date(startDate); // Se não tiver data de fim, gera 1 parcela só
        const rentNumber = parseFloat(rentValue.toString().replace(',', '.'));
        
        // Cálculos Financeiros (Comissão vs Taxa Admin)
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
                  status: 'Pendente'
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

  // 2. LISTAR CONTRATOS (COM FATURAS)
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
              description: c.type === 'Venda' ? `Parcela ${index + 1}` : `Aluguel - Parcela ${index + 1}`
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
}