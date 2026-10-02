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

  // 4. 🚀 GERAR PIX VIA MERCADO PAGO (Nova API de Orders /v1/orders) 🚀
  async generatePix(req: Request, res: Response) {
    try {
      const { id } = req.params; 
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
      
      // O valor deve ser uma String com duas casas decimais no Mercado Pago
      const amountStr = Number(invoice.amount).toFixed(2);

      // 3. Monta o NOVO Payload para a API de Orders
      const paymentData = {
        total_amount: amountStr,
        external_reference: invoice.id,
        description: invoice.description || 'Pagamento de Aluguel',
        processing_mode: 'automatic', // O MP vai processar a transação na hora
        payer: {
          email: email,
          first_name: firstName,
          identification: {
            type: 'CPF',
            number: cpf
          }
        },
        transactions: [
          {
            payments: [
              {
                amount: amountStr,
                payment_method: {
                  id: 'pix'
                }
              }
            ]
          }
        ]
      };

      // 4. Faz a requisição à nova API oficial de Orders do Mercado Pago
      const mpResponse = await fetch('https://api.mercadopago.com/v1/orders', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${tokenMP}`,
          'Content-Type': 'application/json',
          'X-Idempotency-Key': uuidv4() // Impede a criação de 2 orders iguais
        },
        body: JSON.stringify(paymentData)
      });

      const mpResult = await mpResponse.json();

      if (!mpResponse.ok) {
        console.error('Erro no MP Orders:', mpResult);
        return res.status(400).json({ error: 'Erro ao gerar PIX na API de Orders do Mercado Pago.', detail: mpResult });
      }

      // 5. Extrai os dados do PIX gerado (Na nova API, eles vêm dentro da hierarquia transactions -> payments)
      const firstTransaction = mpResult.transactions?.[0];
      const firstPayment = firstTransaction?.payments?.[0];

      const paymentId = firstPayment?.id?.toString() || mpResult.id?.toString();
      const pixQrCode = firstPayment?.payment_method?.qr_code;
      const pixQrCodeBase64 = firstPayment?.payment_method?.qr_code_base64;
      const ticketUrl = firstPayment?.ticket_url || null;

      if (!pixQrCode || !pixQrCodeBase64) {
        console.error("Faltou o QR Code na resposta:", mpResult);
        return res.status(400).json({ error: 'O Mercado Pago não devolveu o QR Code. Confirme se ativou o PIX na sua conta Mercado Pago.' });
      }

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