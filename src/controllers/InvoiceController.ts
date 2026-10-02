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

      const invoices = await prisma.invoice.findMany({
        where: { realEstateId },
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
      return res.status(500).json({ error: 'Erro ao listar faturas.' });
    }
  }

  // 2. CRIAR FATURA MANUAL
  async create(req: Request, res: Response) {
    try {
      const user = req.user as any;
      const realEstateId = user?.realEstateId || user?.id;
      const { contractId, description, amount, dueDate } = req.body;

      const invoice = await prisma.invoice.create({
        data: {
          contractId, realEstateId, description,
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

  // 3. MARCAR COMO PAGA (Manualmente)
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

  // 4. GERAR PIX VIA MERCADO PAGO
  async generatePix(req: Request, res: Response) {
    try {
      const { id } = req.params; // ID da Fatura (Invoice)
      const user = req.user as any;
      const realEstateId = user?.realEstateId || user?.id;

      // 1. Busca a Fatura com os dados do Inquilino e as credenciais da Imobiliária
      const invoice = await prisma.invoice.findUnique({
        where: { id, realEstateId },
        include: {
          contract: { include: { tenant: true } },
          realEstate: true
        }
      });

      if (!invoice) return res.status(404).json({ error: 'Fatura não encontrada.' });
      
      const tokenMP = invoice.realEstate.mpAccessToken;
      if (!tokenMP) {
        return res.status(400).json({ error: 'Mercado Pago não configurado. Adicione o Access Token nas configurações da loja.' });
      }

      if (invoice.status === 'Pago') {
        return res.status(400).json({ error: 'Esta fatura já se encontra paga.' });
      }

      // 2. Prepara os dados do cliente (Inquilino)
      const tenant = invoice.contract.tenant;
      const email = tenant?.email || 'email_padrao@suaimobiliaria.com';
      const firstName = tenant?.name?.split(' ')[0] || 'Inquilino';
      const cpf = tenant?.cpf ? tenant.cpf.replace(/\D/g, '') : '11111111111';

      // 3. Monta o Payload (Carga) para enviar ao Mercado Pago
      const paymentData = {
        transaction_amount: Number(invoice.amount),
        description: invoice.description || 'Pagamento de Aluguel',
        payment_method_id: 'pix',
        payer: {
          email: email,
          first_name: firstName,
          identification: {
            type: 'CPF',
            number: cpf
          }
        }
      };

      // 4. Faz a requisição à API oficial do Mercado Pago
      const mpResponse = await fetch('https://api.mercadopago.com/v1/payments', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${tokenMP}`,
          'Content-Type': 'application/json',
          'X-Idempotency-Key': uuidv4() // Garante que não duplica a cobrança se houver falha de rede
        },
        body: JSON.stringify(paymentData)
      });

      const mpResult = await mpResponse.json();

      if (!mpResponse.ok) {
        console.error('Erro no MP:', mpResult);
        return res.status(400).json({ error: 'Erro ao gerar PIX no Mercado Pago.', detail: mpResult });
      }

      // 5. Extrai os dados do PIX gerado
      const paymentId = mpResult.id.toString();
      const pixQrCode = mpResult.point_of_interaction?.transaction_data?.qr_code;
      const pixQrCodeBase64 = mpResult.point_of_interaction?.transaction_data?.qr_code_base64;
      const ticketUrl = mpResult.point_of_interaction?.transaction_data?.ticket_url;

      // 6. Guarda o QR Code na Fatura no seu banco de dados
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

      return res.json({ message: 'PIX Gerado com sucesso!', invoice: updatedInvoice });

    } catch (error) {
      console.error('Erro ao gerar PIX:', error);
      return res.status(500).json({ error: 'Erro interno ao comunicar com o Gateway.' });
    }
  }
}