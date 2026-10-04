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
          property: { select: { title: true, address: true } },
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

  async updateStatus(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { status, documentUrl } = req.body;

      const dataToUpdate: any = { status };
      if (documentUrl !== undefined) dataToUpdate.documentUrl = documentUrl;

      const term = await prisma.keyTerm.update({
        where: { id },
        data: dataToUpdate
      });

      return res.json(term);
    } catch (error) {
      return res.status(500).json({ error: 'Erro ao atualizar termo.' });
    }
  }

  // =====================================
  // NOVOS MÉTODOS ADICIONADOS
  // =====================================
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