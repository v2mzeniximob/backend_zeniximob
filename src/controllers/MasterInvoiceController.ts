import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { MercadoPagoConfig, Payment } from 'mercadopago';

const prisma = new PrismaClient() as any;

export class MasterInvoiceController {
  
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

  async markAsPaid(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const invoice = await prisma.masterInvoice.update({
        where: { id },
        data: { status: 'Pago', paidDate: new Date() }
      });
      return res.json(invoice);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao dar baixa na fatura.' });
    }
  }

  // 3. GERAR COBRANÇA (PIX OU BOLETO) VIA MERCADO PAGO
  async generateCharge(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { method } = req.body; // Recebe 'pix' ou 'boleto' do frontend

      const invoice = await prisma.masterInvoice.findUnique({
        where: { id },
        include: {
          masterContract: {
            include: { realEstate: true, franchisee: true }
          }
        }
      });

      if (!invoice) return res.status(404).json({ error: 'Fatura não encontrada.' });

      const config = await prisma.masterConfig.findFirst();
      if (!config || !config.mpAccessToken) {
        return res.status(400).json({ error: 'Credenciais do Mercado Pago não configuradas. Vá a Configurações > Mercado Pago.' });
      }

      const client = new MercadoPagoConfig({ accessToken: config.mpAccessToken });
      const payment = new Payment(client);

      // Extrair dados do cliente para a cobrança
      const payerEmail = invoice.masterContract?.realEstate?.email || invoice.masterContract?.franchisee?.email || 'admin@zeniximob.com.br';
      const payerName = invoice.masterContract?.realEstate?.tradeName || invoice.masterContract?.franchisee?.tradeName || 'Cliente Zenix';
      const payerCnpj = invoice.masterContract?.realEstate?.cnpj || invoice.masterContract?.franchisee?.cnpj || '00000000000000';

      // Montar Payload do Mercado Pago
      const paymentData: any = {
        body: {
          transaction_amount: Number(invoice.amount),
          description: invoice.description || 'Assinatura Zenix SaaS',
          payment_method_id: method === 'boleto' ? 'bolbradesco' : 'pix',
          payer: {
            email: payerEmail,
            first_name: payerName
          }
        }
      };

      // O Mercado Pago EXIGE o documento (CPF/CNPJ) válido para emitir Boletos
      if (method === 'boleto') {
        const docNumber = payerCnpj.replace(/\D/g, ''); // Limpa a pontuação
        paymentData.body.payer.identification = {
          type: docNumber.length === 14 ? 'CNPJ' : 'CPF',
          number: docNumber || '00000000000'
        };
      }

      const result = await payment.create(paymentData);

      // Salva os dados retornados (PIX ou Link do Boleto)
      const ticketLink = result.transaction_details?.external_resource_url || result.point_of_interaction?.transaction_data?.ticket_url;

      const updatedInvoice = await prisma.masterInvoice.update({
        where: { id },
        data: {
          mpPaymentId: String(result.id),
          // Se for PIX salva o QRCode, se for Boleto apaga o QRCode antigo (se houver)
          pixQrCode: method === 'pix' ? result.point_of_interaction?.transaction_data?.qr_code : null,
          pixQrCodeBase64: method === 'pix' ? result.point_of_interaction?.transaction_data?.qr_code_base64 : null,
          ticketUrl: method === 'boleto' ? ticketLink : null
        }
      });

      return res.json({ invoice: updatedInvoice, method });

    } catch (error) {
      console.error("Erro no Mercado Pago:", error);
      return res.status(500).json({ error: 'Falha ao gerar cobrança no Mercado Pago. Verifique se o CNPJ/CPF do cliente é válido e as chaves estão corretas.' });
    }
  }
}