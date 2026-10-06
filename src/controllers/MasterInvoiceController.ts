import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
// Certifique-se de ter o SDK instalado: npm install mercadopago
import { MercadoPagoConfig, Payment } from 'mercadopago';

const prisma = new PrismaClient() as any;

export class MasterInvoiceController {
  
  // 1. LISTAR TODAS AS FATURAS DE ASSINATURA SAAS
  async list(req: Request, res: Response) {
    try {
      const invoices = await prisma.masterInvoice.findMany({
        include: {
          masterContract: {
            include: {
              realEstate: { select: { tradeName: true, corporateName: true, cnpj: true, email: true } },
              franchisee: { select: { tradeName: true, corporateName: true, cnpj: true, email: true } }
            }
          }
        },
        orderBy: { dueDate: 'asc' }
      });
      return res.json(invoices);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao listar faturas do SaaS.' });
    }
  }

  // 2. DAR BAIXA MANUAL NUMA FATURA
  async markAsPaid(req: Request, res: Response) {
    try {
      const { id } = req.params;
      
      const invoice = await prisma.masterInvoice.update({
        where: { id },
        data: {
          status: 'Pago',
          paidDate: new Date()
        }
      });

      return res.json(invoice);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao dar baixa na fatura.' });
    }
  }

  // 3. GERAR COBRANÇA (PIX) VIA MERCADO PAGO
  async generateCharge(req: Request, res: Response) {
    try {
      const { id } = req.params;

      // Busca a fatura e o contrato associado
      const invoice = await prisma.masterInvoice.findUnique({
        where: { id },
        include: {
          masterContract: {
            include: { realEstate: true, franchisee: true }
          }
        }
      });

      if (!invoice) return res.status(404).json({ error: 'Fatura não encontrada.' });

      // Busca as credenciais do Master
      const config = await prisma.masterConfig.findFirst();
      if (!config || !config.mpAccessToken) {
        return res.status(400).json({ error: 'Credenciais do Mercado Pago não configuradas. Vá a Configurações > Mercado Pago.' });
      }

      // Se já gerou o PIX antes, apenas retorna os dados existentes para não gerar duplicado
      if (invoice.pixQrCodeBase64) {
        return res.json(invoice);
      }

      // Inicializa o Mercado Pago
      const client = new MercadoPagoConfig({ accessToken: config.mpAccessToken });
      const payment = new Payment(client);

      // Dados do pagador (Imobiliária ou Franqueado)
      const payerEmail = invoice.masterContract?.realEstate?.email || invoice.masterContract?.franchisee?.email || 'admin@zeniximob.com.br';
      const payerName = invoice.masterContract?.realEstate?.tradeName || invoice.masterContract?.franchisee?.tradeName || 'Cliente Zenix';

      // Cria a cobrança PIX
      const paymentData = {
        body: {
          transaction_amount: Number(invoice.amount),
          description: invoice.description || 'Assinatura Zenix SaaS',
          payment_method_id: 'pix',
          payer: {
            email: payerEmail,
            first_name: payerName
          }
        }
      };

      const result = await payment.create(paymentData);

      // Salva os dados do QR Code no banco de dados
      const updatedInvoice = await prisma.masterInvoice.update({
        where: { id },
        data: {
          mpPaymentId: String(result.id),
          pixQrCode: result.point_of_interaction?.transaction_data?.qr_code,
          pixQrCodeBase64: result.point_of_interaction?.transaction_data?.qr_code_base64,
          ticketUrl: result.point_of_interaction?.transaction_data?.ticket_url
        }
      });

      return res.json(updatedInvoice);

    } catch (error) {
      console.error("Erro no Mercado Pago:", error);
      return res.status(500).json({ error: 'Falha ao conectar com o Mercado Pago. Verifique se o Access Token é válido.' });
    }
  }
}