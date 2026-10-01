import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export class InvoiceController {
  
  // 1. Gerar Nova Fatura (Mensalidade / Aluguel)
  async create(req: Request, res: Response) {
    try {
      const user = req.user as any;
      const realEstateId = user?.realEstateId || user?.id;
      if (!realEstateId) return res.status(403).json({ error: 'Acesso negado.' });

      const { contractId, dueDate, barcode, pixQrCodeUrl } = req.body;

      // Busca o contrato para saber os valores acordados
      const contract = await (prisma as any).contract.findUnique({
        where: { id: contractId },
        include: { property: true }
      });

      if (!contract || contract.property.realEstateId !== realEstateId) {
        return res.status(404).json({ error: 'Contrato não encontrado ou acesso negado.' });
      }

      // ==========================================
      // A MAGIA FINANCEIRA: CÁLCULO DE SPLIT (REPASSE)
      // ==========================================
      const totalAmount = contract.rentValue; 
      // Calcula a comissão/taxa de administração da imobiliária
      const realEstateFee = totalAmount * (contract.adminFeePercent / 100); 
      // O que sobra é o repasse do proprietário
      const ownerAmount = totalAmount - realEstateFee;

      const invoice = await (prisma as any).invoice.create({
        data: {
          contractId,
          dueDate: new Date(dueDate),
          status: 'Pendente',
          totalAmount,
          realEstateFee,
          ownerAmount,
          barcode,
          pixQrCodeUrl
        }
      });

      return res.status(201).json(invoice);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao gerar fatura.' });
    }
  }

  // 2. Listar Financeiro (Dashboard Administrativo)
  async list(req: Request, res: Response) {
    try {
      const user = req.user as any;
      const realEstateId = user?.realEstateId || user?.id;
      if (!realEstateId) return res.status(403).json({ error: 'Acesso negado.' });

      const { status } = req.query; // Pode filtrar por "Pendente", "Pago", "Vencido"

      const whereClause: any = {
        contract: { property: { realEstateId } }
      };

      if (status) whereClause.status = status;

      const invoices = await (prisma as any).invoice.findMany({
        where: whereClause,
        include: {
          contract: {
            select: {
              type: true,
              tenant: { select: { name: true, phone: true } },
              property: { select: { title: true, owner: { select: { name: true, bankData: true } } } }
            }
          }
        },
        orderBy: { dueDate: 'asc' } // Ordena pelas que vencem primeiro
      });

      return res.json(invoices);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao listar financeiro.' });
    }
  }

  // 3. Dar Baixa no Pagamento (Marcar como Pago)
  async markAsPaid(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const user = req.user as any;
      const realEstateId = user?.realEstateId || user?.id;
      if (!realEstateId) return res.status(403).json({ error: 'Acesso negado.' });

      // Atualiza para Pago e regista a data e hora em que o dinheiro entrou
      const updatedInvoice = await (prisma as any).invoice.update({
        where: { id },
        data: {
          status: 'Pago',
          paidDate: new Date()
        }
      });

      return res.json(updatedInvoice);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao dar baixa na fatura.' });
    }
  }
}