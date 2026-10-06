import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient() as any;

export class KeyTermController {
  
  async create(req: Request, res: Response) {
    try {
      const user = req.user as any;
      const realEstateId = user?.realEstateId || user?.id;
      if (!realEstateId) return res.status(403).json({ error: 'Acesso negado.' });

      const { type, propertyId, clientId, brokerId, documentUrl } = req.body;

      const term = await prisma.keyTerm.create({
        data: {
          type,
          status: 'Pendente',
          documentUrl,
          propertyId,
          clientId,
          brokerId: brokerId || null,
          realEstateId
        }
      });

      return res.status(201).json(term);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao criar termo de chaves.' });
    }
  }

  async list(req: Request, res: Response) {
    try {
      const user = req.user as any;
      const realEstateId = user?.realEstateId || user?.id;
      
      const terms = await prisma.keyTerm.findMany({
        where: { realEstateId },
        include: {
          property: { select: { title: true, address: true, keyCode: true } },
          client: { select: { name: true, document: true } },
          broker: { select: { name: true } }
        },
        orderBy: { createdAt: 'desc' }
      });

      return res.json(terms);
    } catch (error) {
      return res.status(500).json({ error: 'Erro ao listar termos.' });
    }
  }

  // A MÁGICA ESTÁ AQUI: Integração Termo <-> Quadro de Chaves
  async updateStatus(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { status, documentUrl } = req.body;
      const user = req.user as any;
      const realEstateId = user?.realEstateId || user?.id;
      const brokerId = user?.realEstateId ? user.id : null;

      const dataToUpdate: any = { status };
      if (documentUrl !== undefined) dataToUpdate.documentUrl = documentUrl;

      const term = await prisma.keyTerm.update({
        where: { id },
        data: dataToUpdate,
        include: { client: true }
      });

      // SE O TERMO FOI ASSINADO, ATUALIZAMOS O QUADRO DE CHAVES FISICO!
      if (status === 'Assinado') {
        const isDevolucao = term.type.includes('Devolução');

        if (isDevolucao) {
          // Inquilino devolveu a chave: Retorna para o quadro
          await prisma.property.update({
            where: { id: term.propertyId },
            data: { keyStatus: 'Disponível' }
          });
          
          // Se havia um registro de saída vinculado a este termo, damos baixa
          await prisma.keyMovement.updateMany({
            where: { propertyId: term.propertyId, returnedAt: null },
            data: { returnedAt: new Date(), notes: 'Devolução via Termo Assinado' }
          });
        } else {
          // Inquilino/Comprador pegou a chave: Sai do quadro definitivamente
          await prisma.property.update({
            where: { id: term.propertyId },
            data: { keyStatus: 'Entregue' }
          });

          // Cria o registro físico histórico com RealEstate / Broker corretos
          await prisma.keyMovement.create({
            data: {
              propertyId: term.propertyId,
              realEstateId: term.realEstateId || realEstateId,
              brokerId: term.brokerId || brokerId,
              clientName: term.client.name,
              reason: `Entrega Definitiva (${term.type})`,
              keyTermId: term.id
            }
          });
        }
      }

      return res.json(term);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao atualizar termo.' });
    }
  }

  async update(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { type, propertyId, clientId, brokerId, documentUrl } = req.body;
      const keyTerm = await prisma.keyTerm.update({
        where: { id },
        data: { type, propertyId, clientId, brokerId: brokerId || null, documentUrl }
      });
      return res.json(keyTerm);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao atualizar termo.' });
    }
  }

  async delete(req: Request, res: Response) {
    try {
      const { id } = req.params;
      await prisma.keyTerm.delete({ where: { id } });
      return res.json({ message: 'Termo excluído com sucesso.' });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao excluir termo.' });
    }
  }
}