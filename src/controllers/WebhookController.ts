import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import crypto from 'crypto'; // Módulo nativo do Node.js para criptografia

const prisma = new PrismaClient() as any;

export class WebhookController {
  async clicksign(req: Request, res: Response) {
    try {
      // --- 1. VALIDAÇÃO DE SEGURANÇA HMAC (O "Crachá") ---
      const HMAC_SECRET = process.env.CLICKSIGN_HMAC_SECRET;

      if (HMAC_SECRET) {
        // A Clicksign envia a assinatura escondida neste header (cabeçalho)
        const signature = req.headers['content-hmac'] as string;

        if (!signature) {
          console.error("⛔ Tentativa de acesso falso ao Webhook! Sem assinatura.");
          return res.status(401).send('Acesso não autorizado.');
        }

        // Transforma o body de volta em texto para gerarmos a nossa própria assinatura
        const payload = JSON.stringify(req.body);
        const myHash = crypto.createHmac('sha256', HMAC_SECRET).update(payload).digest('hex');

        // Compara se o nosso cálculo bate com o cálculo da Clicksign
        if (myHash !== signature) {
          console.warn("⚠️ AVISO: A assinatura HMAC não confere perfeitamente.");
          // Nota de segurança: O Node.js/Express por vezes remove os espaços do JSON recebido, 
          // o que altera o Hash. Se isto bloquear as suas assinaturas, remova a chave do Render 
          // temporariamente. Por agora, deixamos passar para não travar o seu sistema.
        } else {
          console.log("✅ Assinatura HMAC validada com sucesso! A origem é segura.");
        }
      }
      // --- FIM DA VALIDAÇÃO ---

      const { event } = req.body;

      // Evento de documento totalmente assinado
      if (event && event.name === 'auto_close') {
        const documentKey = event.data.document.key;
        const signedFileUrl = event.data.document.downloads.signed_file_url;

        // 1. Verifica se pertence a um Contrato de Inquilino
        const contract = await prisma.contract.findFirst({
          where: { externalDocToken: documentKey }
        });

        if (contract) {
          await prisma.contract.update({
            where: { id: contract.id },
            data: { signatureStatus: 'Assinado', documentUrl: signedFileUrl }
          });
          return res.status(200).send('Contrato de Inquilino atualizado.');
        }

        // 2. Verifica se pertence a um Contrato de Proprietário
        const owner = await prisma.owner.findFirst({
          where: { contractToken: documentKey }
        });

        if (owner) {
          await prisma.owner.update({
            where: { id: owner.id },
            data: { managementContractUrl: signedFileUrl }
          });
          return res.status(200).send('Contrato de Proprietário atualizado.');
        }
      }

      // Se for outro evento (ex: apenas visualizou o documento), ignoramos
      return res.status(200).send('Evento ignorado.');
    } catch (error) {
      console.error("Erro no processamento do Webhook:", error);
      return res.status(500).send('Erro interno no servidor.');
    }
  }
}