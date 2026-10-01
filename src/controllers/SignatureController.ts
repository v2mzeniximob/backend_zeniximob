import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import axios from 'axios';

const prisma = new PrismaClient();

// Exemplo configurável com API Token (ZapSign, Clicksign ou Autentique via .env)
const SIGN_API_TOKEN = process.env.SIGN_API_TOKEN || 'demo-token';

export class SignatureController {
  
  // 1. Enviar minuta para assinatura por e-mail
  async sendForSignature(req: Request, res: Response) {
    try {
      const { contractId, signerName, signerEmail, signerPhone, pdfBase64, documentName } = req.body;
      const user = req.user as any;
      const realEstateId = user?.realEstateId || user?.id;

      const contract = await (prisma as any).contract.findUnique({
        where: { id: contractId },
        include: { property: true, tenant: true }
      });

      if (!contract || contract.property.realEstateId !== realEstateId) {
        return res.status(404).json({ error: 'Contrato não encontrado.' });
      }

      /* 
        Integração com API de Assinatura (Exemplo com padrão REST / ZapSign / Autentique):
        Se não houver token em desenvolvimento, geramos um mock funcional.
      */
      let externalDocToken = `DOC-${Date.now()}`;
      let signUrl = `https://sandbox.assinatura.com/sign/${externalDocToken}`;

      if (process.env.SIGN_API_TOKEN) {
        // Chamada real para a API do Gateway
        const response = await axios.post(
          'https://api.zapsign.com.br/api/v1/docs/',
          {
            name: documentName || `Contrato - ${contract.property.title}`,
            base64_pdf: pdfBase64,
            signers: [
              {
                name: signerName,
                email: signerEmail,
                phone_country: '55',
                phone_number: signerPhone?.replace(/\D/g, '') || '',
                send_automatic_email: true,
                send_automatic_whatsapp: Boolean(signerPhone)
              }
            ]
          },
          { headers: { Authorization: `Bearer ${SIGN_API_TOKEN}` } }
        );

        externalDocToken = response.data.token;
        signUrl = response.data.signers?.[0]?.sign_url || signUrl;
      }

      // Atualiza o contrato no banco
      const updatedContract = await (prisma as any).contract.update({
        where: { id: contractId },
        data: {
          status: 'Aguardando Assinatura',
          externalDocToken,
          signUrl,
          signerEmail,
          signatureStatus: 'Pendente'
        }
      });

      return res.json({
        message: 'Contrato enviado para assinatura com sucesso!',
        signUrl,
        contract: updatedContract
      });
    } catch (error: any) {
      console.error('Erro na integração de assinatura:', error?.response?.data || error);
      return res.status(500).json({ error: 'Falha ao despachar contrato para assinatura digital.' });
    }
  }

  // 2. Webhook: Chamado automaticamente pela plataforma externa após a assinatura
  async handleWebhook(req: Request, res: Response) {
    try {
      const payload = req.body;
      /*
        A plataforma de assinatura envia o token do documento e o link do PDF carimbado.
        Exemplo: { token: 'DOC-123', status: 'signed', signed_file: 'https://...' }
      */
      const token = payload.token || payload.document_id;
      const status = payload.status || (payload.event_type === 'doc_signed' ? 'signed' : null);
      const signedPdfUrl = payload.signed_file || payload.signed_file_url || payload.document_url;

      if (!token) {
        return res.status(400).json({ error: 'Token ausente no webhook.' });
      }

      const contract = await (prisma as any).contract.findFirst({
        where: { externalDocToken: token },
        include: { property: true }
      });

      if (!contract) {
        return res.status(404).json({ error: 'Contrato associado ao token não encontrado.' });
      }

      if (status === 'signed' || status === 'completed') {
        // 1. Atualiza o contrato para Ativo com o PDF final assinado
        await (prisma as any).contract.update({
          where: { id: contract.id },
          data: {
            status: 'Ativo',
            signatureStatus: 'Assinado',
            signedDocumentUrl: signedPdfUrl || contract.documentUrl,
            documentUrl: signedPdfUrl || contract.documentUrl
          }
        });

        // 2. Se for contrato de Locação, assegura que o imóvel fica Alugado
        if (contract.type === 'Locação') {
          await (prisma as any).property.update({
            where: { id: contract.propertyId },
            data: { rentStatus: 'Alugado', tenantId: contract.tenantId }
          });
        }

        // 3. Se for contrato de Administração (Imobiliária x Proprietário), atualiza o proprietário
        if (contract.type === 'Administração' && contract.property.ownerId) {
          await (prisma as any).owner.update({
            where: { id: contract.property.ownerId },
            data: { managementContractUrl: signedPdfUrl || contract.documentUrl }
          });
        }
      }

      return res.status(200).json({ received: true });
    } catch (error) {
      console.error('Erro no webhook de assinatura:', error);
      return res.status(500).json({ error: 'Erro interno ao processar webhook.' });
    }
  }
}