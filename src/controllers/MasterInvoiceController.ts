import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';

const prisma = new PrismaClient() as any;

export class MasterInvoiceController {
  
  // ==========================================
  // 1. LISTAR TODAS AS FATURAS DE ASSINATURA SAAS
  // ==========================================
  async list(req: Request, res: Response) {
    try {
      const invoices = await prisma.masterInvoice.findMany({
        include: {
          masterContract: {
            include: {
              realEstate: { select: { tradeName: true, corporateName: true, cnpj: true, email: true, address: true, cep: true } },
              franchisee: { select: { tradeName: true, corporateName: true, cnpj: true, email: true, address: true, cep: true } }
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

  // ==========================================
  // 2. DAR BAIXA MANUAL NUMA FATURA
  // ==========================================
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

  // ==========================================
  // 3. 🚀 GERAR COBRANÇA (PIX OU BOLETO) NO MASTER 🚀
  // ==========================================
  async generateCharge(req: Request, res: Response) {
    try {
      const { id } = req.params; 
      const { method } = req.body; // 'pix' ou 'boleto'

      // Busca a Fatura e o Contrato associado
      const invoice = await prisma.masterInvoice.findUnique({
        where: { id },
        include: {
          masterContract: {
            include: {
              realEstate: true,
              franchisee: true
            }
          }
        }
      });

      if (!invoice) return res.status(404).json({ error: 'Fatura não encontrada.' });

      // Busca as Credenciais do Master
      const config = await prisma.masterConfig.findFirst();
      const tokenMP = config?.mpAccessToken;
      
      if (!tokenMP) return res.status(400).json({ error: 'Mercado Pago não configurado no Master. Vá em Configurações.' });
      if (invoice.status === 'Pago') return res.status(400).json({ error: 'Esta fatura já está paga.' });

      const chargeDescription = invoice.description || 'Assinatura Zenix SaaS';

      // Define quem é o cliente (Franqueado ou Imobiliária)
      const clientNode = invoice.masterContract?.realEstate || invoice.masterContract?.franchisee;

      // ==========================================
      // TRATAMENTO DOS DADOS DO CLIENTE (Com verificação de TESTE)
      // ==========================================
      const isTestEnv = tokenMP.startsWith('TEST-');

      let email = clientNode?.email?.trim() || 'cliente@zeniximob.com.br';
      let cleanDoc = clientNode?.cnpj ? clientNode.cnpj.replace(/\D/g, '') : '';
      
   
     // Se for ambiente de TESTE ou o CNPJ estiver vazio/inválido, forçamos dados genéricos do Sandbox para não dar erro
      if (isTestEnv || cleanDoc.length < 11) {
        // NÃO use 'test_user_' no e-mail, pois o Mercado Pago bloqueia. Usamos um e-mail genérico do próprio sistema.
        email = `cliente.sandbox.${Date.now()}@zeniximob.com.br`; 
        cleanDoc = '50645012015'; // CPF válido genérico para testes do Mercado Pago
      }
      
      const docType = cleanDoc.length === 14 ? 'CNPJ' : 'CPF';
      
      const rawName = clientNode?.tradeName || clientNode?.corporateName || 'Cliente Zenix';
      const nameParts = rawName.split(' ');
      const firstName = nameParts[0] || 'Cliente';
      const lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : 'SaaS';

      // ==========================================
      // SEPARAÇÃO INTELIGENTE DE RUA E NÚMERO (Para Boletos)
      // ==========================================
      let cep = clientNode?.cep ? clientNode.cep.replace(/\D/g, '') : '01001000';
      if (cep.length !== 8) cep = '01001000';
      
      let rawAddress = clientNode?.address?.trim() || 'Rua Principal, 100';
      let streetName = rawAddress;
      let streetNumber = 'S/N';
      
      if (rawAddress.includes(',')) {
        const parts = rawAddress.split(',');
        streetName = parts[0].trim();
        streetNumber = parts[1].replace(/\D/g, '') || 'S/N'; 
      } else {
        const match = rawAddress.match(/(.*?)\s+(\d+)\s*$/);
        if (match) {
          streetName = match[1].trim(); 
          streetNumber = match[2];      
        } else {
          const numMatch = rawAddress.match(/\d+/);
          if (numMatch) {
            streetNumber = numMatch[0];
            streetName = rawAddress.replace(numMatch[0], '').trim();
          }
        }
      }

      streetNumber = String(streetNumber);
      if (!streetNumber || streetNumber === 'S/N') streetNumber = '100';

      const federalUnit = 'SP'; // Fallback padrão
      const neighborhood = 'Centro'; // Fallback padrão
      const city = 'São Paulo'; // Fallback padrão

      // ==========================================
      // FORMATAÇÃO DA DATA DE VENCIMENTO (ISO 8601)
      // ==========================================
      const dueDateObj = new Date(invoice.dueDate);
      dueDateObj.setUTCHours(23, 59, 59, 999);
      const dateOfExpiration = dueDateObj.toISOString();

      // ==========================================
      // MONTAGEM DO PAYLOAD
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

      const paymentData: any = {
        transaction_amount: Number(Number(invoice.amount).toFixed(2)), 
        description: chargeDescription.substring(0, 200),
        payment_method_id: method === 'boleto' ? 'bolbradesco' : 'pix',
        payer: payerData
      };

      if (method === 'boleto') {
        paymentData.date_of_expiration = dateOfExpiration;
      }

      console.log("==========================================");
      console.log(`🚀 GERANDO COBRANÇA MASTER SAAS - MP`);
      console.log("📦 PAYLOAD ENVIADO:", JSON.stringify(paymentData, null, 2));
      console.log("==========================================");

      // ==========================================
      // REQUISIÇÃO DIRETA A API DO MERCADO PAGO
      // ==========================================
      const mpResponse = await fetch('https://api.mercadopago.com/v1/payments', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${tokenMP}`,
          'Content-Type': 'application/json',
          'X-Idempotency-Key': uuidv4() // Garante que a requisição não duplica
        },
        body: JSON.stringify(paymentData)
      });

      const mpResult = await mpResponse.json();

      if (!mpResponse.ok) {
        console.error("❌ ERRO MERCADO PAGO:", JSON.stringify(mpResult, null, 2));
        return res.status(400).json({ error: 'Erro ao gerar cobrança no Mercado Pago.', detail: mpResult });
      }

      console.log("✅ Cobrança Master gerada com sucesso! ID:", mpResult.id);

      // ==========================================
      // ATUALIZAR A FATURA NO BANCO DE DADOS
      // ==========================================
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

      const updatedInvoice = await prisma.masterInvoice.update({
        where: { id },
        data: {
          mpPaymentId: paymentId,
          pixQrCode,
          pixQrCodeBase64,
          ticketUrl,
          status: 'Pendente' // ou 'Aguardando Pagamento'
        }
      });

      return res.json({ 
        message: 'Cobrança gerada com sucesso!', 
        invoice: updatedInvoice,
        method
      });

    } catch (error) {
      console.error('❌ ERRO CRÍTICO NO MASTER INVOICE CONTROLLER:', error);
      return res.status(500).json({ error: 'Erro interno ao comunicar com o Gateway do Mercado Pago.' });
    }
  }
}