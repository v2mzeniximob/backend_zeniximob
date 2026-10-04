import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';

const prisma = new PrismaClient() as any;

export class InvoiceController {
  
  // 1. LISTAR FATURAS GERAIS
  async list(req: Request, res: Response) {
    try {
      const user = req.user as any;
      const realEstateId = user?.realEstateId || user?.id;

      const invoices = await prisma.invoice.findMany({
        where: { contract: { property: { realEstateId } } },
        include: {
          contract: {
            include: {
              property: { select: { title: true } },
              tenant: { select: { name: true, document: true, email: true, phone: true, corporateName: true } }
            }
          }
        },
        orderBy: { dueDate: 'asc' }
      });
      
      const mapped = invoices.map((inv: any, idx: number) => {
        const isSale = inv.contract?.type === 'Venda';
        return {
         ...inv,
         amount: inv.totalAmount,
         description: inv.description || (isSale ? `Venda - Parcela ${idx + 1}` : `Aluguel - Parcela ${idx + 1}`)
        };
      });

      return res.json(mapped);
    } catch (error) {
      return res.status(500).json({ error: 'Erro ao listar faturas.' });
    }
  }

  // 2. CRIAR FATURA MANUAL
  async create(req: Request, res: Response) {
    try {
      const { contractId, amount, dueDate, description } = req.body;
      const amt = Number(amount);
      const invoice = await prisma.invoice.create({
        data: {
          contractId, 
          totalAmount: amt,
          realEstateFee: 0,
          ownerAmount: amt,
          dueDate: new Date(dueDate),
          status: 'Pendente',
          description: description || 'Nova Fatura'
        }
      });
      return res.status(201).json({ ...invoice, amount: invoice.totalAmount });
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
        data: { status: 'Pago', paidDate: new Date() }
      });
      return res.json({ ...updated, amount: updated.totalAmount });
    } catch (error) {
      return res.status(500).json({ error: 'Erro ao atualizar.' });
    }
  }

  // 4. 🚀 GERAR COBRANÇA (PIX OU BOLETO) 🚀
  async generateCharge(req: Request, res: Response) {
    try {
      const { id } = req.params; 
      const { method } = req.body; 

      const invoice = await prisma.invoice.findUnique({
        where: { id },
        include: {
          contract: {
            include: {
              tenant: true,
              property: { include: { realEstate: true } }
            }
          }
        }
      });

      if (!invoice) return res.status(404).json({ error: 'Fatura não encontrada.' });
      
      const tokenMP = invoice.contract?.property?.realEstate?.mpAccessToken;
      if (!tokenMP) return res.status(400).json({ error: 'Mercado Pago não configurado. Adicione o Token nas configurações da loja.' });
      if (invoice.status === 'Pago') return res.status(400).json({ error: 'Esta fatura já se encontra paga.' });

      const isSale = invoice.contract?.type === 'Venda';
      const chargeDescription = invoice.description || (isSale ? 'Pagamento de Parcela de Venda' : 'Pagamento de Aluguel');
      const tenant = invoice.contract.tenant;

      // ==========================================
      // TRATAMENTO DE DADOS (SIMPLIFICADO PARA EVITAR 500)
      // ==========================================
      const email = tenant?.email?.trim() || 'cliente@suaimobiliaria.com.br';
      const cleanDoc = tenant?.document ? tenant.document.replace(/\D/g, '') : '11111111111';
      const docType = cleanDoc.length === 14 ? 'CNPJ' : 'CPF';
      
      const rawName = tenant?.name?.trim() || 'Cliente';
      const nameParts = rawName.split(' ');
      const firstName = nameParts[0] || 'Cliente';
      const lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : 'Sobrenome';

      // ==========================================
      // PAYLOAD MERCADO PAGO (SEM ENDEREÇO PARA EVITAR ERRO DE CEP)
      // ==========================================
      const paymentData = {
        transaction_amount: Number(Number(invoice.totalAmount).toFixed(2)), 
        description: chargeDescription.substring(0, 200),
        payment_method_id: method === 'boleto' ? 'bolbradesco' : 'pix',
        payer: {
          email: email,
          first_name: firstName,
          last_name: lastName,
          identification: { type: docType, number: cleanDoc }
          // Endereço removido. O MP exige apenas Nome, Email e CPF para a maioria das contas.
        }
      };

      console.log("==========================================");
      console.log("🚀 INICIANDO GERAÇÃO NO MERCADO PAGO");
      console.log("🔑 Token Usado:", tokenMP.substring(0, 10) + "********"); // <--- AQUI VOCÊ VAI VER O SEU TOKEN
      console.log("📦 PAYLOAD ENVIADO PARA O MP:");
      console.log(JSON.stringify(paymentData, null, 2));
      console.log("==========================================");

      const mpResponse = await fetch('https://api.mercadopago.com/v1/payments', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${tokenMP}`,
          'Content-Type': 'application/json',
          'X-Idempotency-Key': uuidv4() // Idempotência recomendada pelo suporte
        },
        body: JSON.stringify(paymentData)
      });

      const mpResult = await mpResponse.json();

      if (!mpResponse.ok) {
        console.error("❌ ERRO RETORNADO PELO MERCADO PAGO:");
        console.error(JSON.stringify(mpResult, null, 2));
        console.log("==========================================");
        return res.status(400).json({ error: 'Erro ao gerar cobrança no Mercado Pago.', detail: mpResult });
      }

      const paymentId = mpResult.id.toString();
      let pixQrCode = null;
      let pixQrCodeBase64 = null;
      let ticketUrl = null;

      if (method === 'pix') {
        pixQrCode = mpResult.point_of_interaction?.transaction_data?.qr_code;
        pixQrCodeBase64 = mpResult.point_of_interaction?.transaction_data?.qr_code_base64;
        ticketUrl = mpResult.point_of_interaction?.transaction_data?.ticket_url;
      } 
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

      return res.json({ 
        message: 'Cobrança gerada com sucesso!', 
        invoice: { ...updatedInvoice, amount: updatedInvoice.totalAmount, description: chargeDescription } 
      });

    } catch (error) {
      console.error('❌ ERRO CRÍTICO NO SERVIDOR:', error);
      return res.status(500).json({ error: 'Erro interno ao comunicar com o Gateway.' });
    }
  }

  // 5. ATUALIZAR DADOS DO REPASSE (Proprietário)
  async updateRepasse(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { iptuValue, condoValue, waterValue, fineValue, transferStatus, iptuDocUrl, condoDocUrl, waterDocUrl, fineDocUrl } = req.body;

      const updated = await prisma.invoice.update({
        where: { id },
        data: {
          iptuValue: Number(iptuValue || 0),
          condoValue: Number(condoValue || 0),
          waterValue: Number(waterValue || 0),
          fineValue: Number(fineValue || 0),
          transferStatus: transferStatus || 'Aguardando',
          transferDate: transferStatus === 'Repassado' ? new Date() : null,
          iptuDocUrl, condoDocUrl, waterDocUrl, fineDocUrl
        }
      });

      return res.json({ message: 'Repasse atualizado com sucesso!', invoice: updated });
    } catch (error) {
      console.error('Erro ao atualizar repasse:', error);
      return res.status(500).json({ error: 'Erro ao atualizar dados do repasse.' });
    }
  }
}