import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient() as any;

export class WebhookController {
  async clicksign(req: Request, res: Response) {
    try {
      const { event } = req.body;

      // A Clicksign envia o evento 'auto_close' quando o documento é totalmente assinado
      if (event && event.name === 'auto_close') {
        const documentKey = event.data.document.key;
        const signedFileUrl = event.data.document.downloads.signed_file_url;

        // 1. Verifica se a chave pertence a um Contrato de Inquilino
        const contract = await prisma.contract.findFirst({
          where: { externalDocToken: documentKey }
        });

        if (contract) {
          await prisma.contract.update({
            where: { id: contract.id },
            data: {
              signatureStatus: 'Assinado', // Atualiza o status
              documentUrl: signedFileUrl   // Salva o PDF final com validade legal
            }
          });
          return res.status(200).send('Contrato de Inquilino atualizado com PDF assinado.');
        }

        // 2. Verifica se a chave pertence a um Contrato de Proprietário
        const owner = await prisma.owner.findFirst({
          where: { contractToken: documentKey }
        });

        if (owner) {
          await prisma.owner.update({
            where: { id: owner.id },
            data: {
              managementContractUrl: signedFileUrl // Substitui o link de assinar pelo PDF final
            }
          });
          return res.status(200).send('Contrato de Proprietário atualizado com PDF assinado.');
        }
      }

      // Se for outro evento (ex: visualizou o documento), ignoramos
      return res.status(200).send('Evento ignorado.');
    } catch (error) {
      console.error("Erro no Webhook da Clicksign:", error);
      return res.status(500).send('Erro interno no processamento do Webhook.');
    }
  }
}