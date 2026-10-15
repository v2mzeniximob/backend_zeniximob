import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { ContaAzulService } from '../services/ContaAzulService';

const prisma = new PrismaClient() as any;

export class FinanceExpenseController {
  private static getRealEstateId(req: Request): string {
    const user = (req as any).user;
    return String((req as any).realEstateId || user?.realEstateId || user?.id || '');
  }

  // ==========================================
  // DESPESAS DE CONTRATO (IPTU, Condomínio, Manutenção)
  // ==========================================
  async createPropertyExpense(req: Request, res: Response) {
    try {
      const { propertyId, contractId, description, amount, dueDate, payerType, category, documentUrl } = req.body;

      const expense = await prisma.propertyExpense.create({
        data: {
          propertyId,
          contractId: contractId || null,
          description,
          amount: Number(amount),
          dueDate: new Date(dueDate),
          payerType: payerType || 'TENANT', // "TENANT" ou "OWNER"
          category: category || 'Manutenção',
          documentUrl: documentUrl || null
        }
      });

      // Se a despesa for de responsabilidade do inquilino, podemos somar automaticamente na próxima Invoice ativa do contrato
      if (payerType === 'TENANT' && contractId) {
        const activeInvoice = await prisma.invoice.findFirst({
          where: { contractId, status: 'Pendente' },
          orderBy: { dueDate: 'asc' }
        });
        if (activeInvoice) {
          await prisma.invoice.update({
            where: { id: activeInvoice.id },
            data: { totalAmount: activeInvoice.totalAmount + Number(amount) }
          });
        }
      }

      // Se for de responsabilidade do proprietário, abate do próximo repasse (ownerAmount)
      if (payerType === 'OWNER' && contractId) {
        const activeInvoice = await prisma.invoice.findFirst({
          where: { contractId, status: 'Pendente' },
          orderBy: { dueDate: 'asc' }
        });
        if (activeInvoice) {
          await prisma.invoice.update({
            where: { id: activeInvoice.id },
            data: { ownerAmount: Math.max(0, activeInvoice.ownerAmount - Number(amount)) }
          });
        }
      }

      return res.status(201).json({ message: 'Despesa de contrato lançada com sucesso!', expense });
    } catch (error) {
      console.error('[Finance] Erro ao criar despesa de imóvel:', error);
      return res.status(500).json({ error: 'Erro ao registrar despesa do contrato.' });
    }
  }

  async listPropertyExpenses(req: Request, res: Response) {
    try {
      const { propertyId, contractId } = req.query;
      const where: any = {};
      if (propertyId) where.propertyId = String(propertyId);
      if (contractId) where.contractId = String(contractId);

      const expenses = await prisma.propertyExpense.findMany({
        where,
        orderBy: { dueDate: 'desc' }
      });
      return res.json(expenses);
    } catch (error) {
      return res.status(500).json({ error: 'Erro ao listar despesas.' });
    }
  }

  // ==========================================
  // CONTAS A PAGAR DA IMOBILIÁRIA (DRE)
  // ==========================================
  async createAgencyExpense(req: Request, res: Response) {
    try {
      const realEstateId = FinanceExpenseController.getRealEstateId(req);
      const { description, amount, dueDate, category, supplierName, documentUrl } = req.body;

      const expense = await prisma.agencyExpense.create({
        data: {
          realEstateId,
          description,
          amount: Number(amount),
          dueDate: new Date(dueDate),
          category: category || 'Operacional',
          supplierName: supplierName || null,
          documentUrl: documentUrl || null
        }
      });

      return res.status(201).json(expense);
    } catch (error) {
      return res.status(500).json({ error: 'Erro ao cadastrar conta a pagar.' });
    }
  }

  async listAgencyExpenses(req: Request, res: Response) {
    try {
      const realEstateId = FinanceExpenseController.getRealEstateId(req);
      const expenses = await prisma.agencyExpense.findMany({
        where: { realEstateId },
        orderBy: { dueDate: 'desc' }
      });
      return res.json(expenses);
    } catch (error) {
      return res.status(500).json({ error: 'Erro ao listar contas a pagar.' });
    }
  }

  // ==========================================
  // INTEGRAÇÃO CONTA AZUL (EMISSÃO DE BOLETO ERP)
  // ==========================================
  async emitContaAzulBoleto(req: Request, res: Response) {
    try {
      const realEstateId = FinanceExpenseController.getRealEstateId(req);
      const { invoiceId } = req.body;

      const storeConfig = await prisma.contaAzulConfig.findUnique({
        where: { realEstateId }
      });

      if (!storeConfig || !storeConfig.accessToken) {
        return res.status(400).json({ error: 'Conta Azul não está conectada ou configurada para esta imobiliária.' });
      }

      const invoice = await prisma.invoice.findUnique({
        where: { id: invoiceId },
        include: { contract: { include: { tenant: true } } }
      });

      if (!invoice) {
        return res.status(404).json({ error: 'Fatura não encontrada.' });
      }

      const tenant = invoice.contract?.tenant;
      const chargePayload = {
        customer_document: tenant?.document?.replace(/\D/g, '') || '00000000000',
        customer_name: tenant?.name || 'Inquilino',
        amount: invoice.totalAmount,
        due_date: invoice.dueDate.toISOString().split('T')[0],
        description: invoice.description || 'Aluguel / Fatura ZenixImob'
      };

      const result = await ContaAzulService.createBoleto(storeConfig.accessToken, chargePayload);

      // Atualiza a fatura com o boleto da Conta Azul
      const updatedInvoice = await prisma.invoice.update({
        where: { id: invoice.id },
        data: {
          barcode: result.bar_code || null,
          ticketUrl: result.pdf_url || null
        }
      });

      return res.json({
        message: 'Boleto emitido com sucesso via Conta Azul!',
        result,
        invoice: updatedInvoice
      });
    } catch (error: any) {
      console.error('[ContaAzul] Erro ao emitir boleto:', error);
      return res.status(500).json({ error: error.message || 'Erro ao emitir boleto na Conta Azul.' });
    }
  }
}