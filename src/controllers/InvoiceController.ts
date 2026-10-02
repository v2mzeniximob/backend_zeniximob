import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';

const prisma = new PrismaClient() as any;

export class InvoiceController {
  
  // 1. LISTAR FATURAS
  async list(req: Request, res: Response) {
    try {
      const user = req.user as any;
      const realEstateId = user?.realEstateId || user?.id;

      // Busca as faturas navegando pela relação (Fatura -> Contrato -> Imóvel -> Imobiliária)
      const invoices = await prisma.invoice.findMany({
        where: {
          contract: {
            property: {
              realEstateId: realEstateId
            }
          }
        },
        include: {
          contract: {
            include: {
              property: { select: { title: true } },
              tenant: { select: { name: true, cpf: true, email: true } }
            }
          }
        },
        orderBy: { dueDate: 'asc' }
      });
      return res.json(invoices);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao listar faturas.' });
    }
  }

  // 2. CRIAR FATURA MANUAL
  async create(req: Request, res: Response) {
    try {
      const { contractId, description, amount, dueDate } = req.body;
      const invoice = await prisma.invoice.create({
        data: {
          contractId, description,
          amount: Number(amount),
          dueDate: new Date(dueDate),
          status: 'Pendente'
        }
      });
      return res.status(201).json(invoice);
    } catch (error) {
      return res.status(500).json({ error: 'Erro ao criar fatura.' });
    }
  }

  // 3. MARCAR COMO PAGA MANUALMENTE
  async markAsPaid(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const updated = await prisma.invoice.update({
        where: { id },
        data: { status: 'Pago' }
      });
      return res.json(updated);
    } catch (error) {
      return res.status(500).json({ error: 'Erro ao baixar fatura.' });
    }
  }

  // 4. 🚀 GERAR COBRANÇA (PIX OU BOLETO) 🚀
  async generateCharge(req: Request, res: Response) {
    try {
      const { id } = req.params; 
      const { method } = req.body; // 'pix' ou 'boleto'

      // Encontra a fatura e navega até à imobiliária para pegar o Token do Mercado Pago
      const invoice = await prisma.invoice.findFirst({
        where: { id: id },
        include: {
          contract: {
            include: {
              tenant: true,
              property: {
                include: { realEstate: true }
              }
            }
          }
        }
      });

      if (!invoice) return res.status(404).json({ error: 'Fatura não encontrada.' });

      const tokenMP = invoice.contract?.property?.realEstate?.mpAccessToken;
      if (!tokenMP) return res.status(400).json({ error: 'Mercado Pago não configurado. Adicione o Token nas configurações da loja.' });
      if (invoice.status === 'Pago') return res.status(400).json({ error: 'Esta fatura já se encontra paga.' });

      const tenant = invoice.contract.tenant;
      const email = tenant?.email || 'email_padrao@suaimobiliaria.com';
      const firstName = tenant?.name?.split(' ')[0] || 'Inquilino';
      const cpf = tenant?.cpf ? tenant.cpf.replace(/\D/g, '') : '11111111111';

      // Monta o Payload para a API do Mercado Pago
      const paymentData = {
        transaction_amount: Number(invoice.amount),
        description: invoice.description || 'Pagamento de Aluguel',
        payment_method_id: method === 'boleto' ? 'bolbradesco' : 'pix',
        payer: {
          email: email,
          first_name: firstName,
          identification: { type: 'CPF', number: cpf }
        }
      };

      const mpResponse = await fetch('https://api.mercadopago.com/v1/payments', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${tokenMP}`,
          'Content-Type': 'application/json',
          'X-Idempotency-Key': uuidv4()
        },
        body: JSON.stringify(paymentData)
      });

      const mpResult = await mpResponse.json();

      if (!mpResponse.ok) {
        console.error('Erro no MP:', mpResult);
        return res.status(400).json({ error: 'Erro ao gerar cobrança no Mercado Pago.', detail: mpResult });
      }

      const paymentId = mpResult.id.toString();
      let pixQrCode = null;
      let pixQrCodeBase64 = null;
      let ticketUrl = null;

      // Se for PIX
      if (method === 'pix') {
        pixQrCode = mpResult.point_of_interaction?.transaction_data?.qr_code;
        pixQrCodeBase64 = mpResult.point_of_interaction?.transaction_data?.qr_code_base64;
        ticketUrl = mpResult.point_of_interaction?.transaction_data?.ticket_url;
      } 
      // Se for BOLETO
      else if (method === 'boleto') {
        ticketUrl = mpResult.transaction_details?.external_resource_url || mpResult.point_of_interaction?.transaction_data?.ticket_url;
      }

      const updatedInvoice = await prisma.invoice.update({
        where: { id },
        data: {
          mpPaymentId: paymentId,
          pixQrCode,
          pixQrCodeBase64,
          ticketUrl,
          status: 'Aguardando Pagamento'
        }
      });

      return res.json({ message: 'Cobrança gerada com sucesso!', invoice: updatedInvoice });

    } catch (error) {
      console.error('Erro ao gerar cobrança:', error);
      return res.status(500).json({ error: 'Erro interno ao comunicar com o Gateway.' });
    }
  }
}