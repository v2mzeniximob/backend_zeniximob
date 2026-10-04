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
              tenant: { select: { name: true, document: true, email: true } }
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
      const property = invoice.contract.property;

      // ==========================================
      // TRATAMENTO DE DADOS DO CLIENTE
      // ==========================================
      const email = tenant?.email?.trim() || 'cliente@mail.com';
      const cleanDoc = tenant?.document ? tenant.document.replace(/\D/g, '') : '11111111111';
      const docType = cleanDoc.length === 14 ? 'CNPJ' : 'CPF';
      
      const rawName = tenant?.name?.trim() || 'Cliente';
      const nameParts = rawName.split(' ');
      const firstName = nameParts[0] || 'Cliente';
      const lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : 'Sobrenome';

      // ==========================================
      // TRATAMENTO INTELIGENTE DE ENDEREÇO
      // ==========================================
      let cep = property?.cep ? property.cep.replace(/\D/g, '') : '01001000';
      if (cep.length !== 8) cep = '01001000';
      
      let rawAddress = property?.address?.trim() || 'Rua Principal, 100';
      let streetName = rawAddress;
      let streetNumber = '100'; 
      
      if (rawAddress.includes(',')) {
        // Caso 1: Tem vírgula (Ex: "Rua Josefina Grassini, 120")
        const parts = rawAddress.split(',');
        streetName = parts[0].trim();
        const numMatch = parts[1].match(/\d+/); // Pega apenas os números após a vírgula
        streetNumber = numMatch ? numMatch[0] : '100';
      } else {
        // Caso 2: Não tem vírgula (Ex: "Rua Josefina Grassini 120")
        // O Regex pega toda a string antes do último bloco de números
        const numMatch = rawAddress.match(/(.*\D)\s*(\d+)/);
        if (numMatch) {
          streetName = numMatch[1].trim(); // Tudo que não for o número ("Rua Josefina Grassini")
          streetNumber = numMatch[2];      // O número ("120")
        }
      }

      let federalUnit = property?.state ? property.state.trim().toUpperCase() : 'SP';
      if (federalUnit.length !== 2) federalUnit = 'SP'; 

      const neighborhood = property?.neighborhood || 'Centro';
      const city = property?.city || 'São Paulo';

      // ==========================================
      // CONSTRUÇÃO DO PAYLOAD MERCADO PAGO
      // ==========================================
      const payerData: any = {
        email: email,
        first_name: firstName,
        last_name: lastName,
        identification: { type: docType, number: cleanDoc }
      };

      if (method === 'boleto') {
        payerData.address = {
           zip_code: cep,
           street_name: streetName.substring(0, 200),
           street_number: streetNumber.substring(0, 200),
           neighborhood: neighborhood.substring(0, 200),
           city: city.substring(0, 200),
           federal_unit: federalUnit
        };
      }

      const paymentData = {
        transaction_amount: Number(Number(invoice.totalAmount).toFixed(2)), 
        description: chargeDescription.substring(0, 200),
        payment_method_id: method === 'boleto' ? 'bolbradesco' : 'pix',
        payer: payerData
      };

      console.log("==========================================");
      console.log("🚀 INICIANDO GERAÇÃO NO MERCADO PAGO");
      console.log("📦 PAYLOAD ENVIADO PARA O MP:");
      console.log(JSON.stringify(paymentData, null, 2));
      console.log("==========================================");

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
        invoice: { 
          ...updatedInvoice, 
          amount: updatedInvoice.totalAmount,
          description: chargeDescription
        } 
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
          iptuDocUrl,
          condoDocUrl,
          waterDocUrl,
          fineDocUrl
        }
      });

      return res.json({ message: 'Repasse atualizado com sucesso!', invoice: updated });
    } catch (error) {
      console.error('Erro ao atualizar repasse:', error);
      return res.status(500).json({ error: 'Erro ao atualizar dados do repasse.' });
    }
  }
}