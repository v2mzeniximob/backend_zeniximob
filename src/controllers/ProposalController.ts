import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient() as any;

export class ProposalController {
  async create(req: Request, res: Response) {
    try {
      const user = req.user as any;
      const realEstateId = user?.realEstateId || user?.id;
      if (!realEstateId) return res.status(403).json({ error: 'Acesso negado.' });

      const { type, propertyId, clientId, brokerId, documentUrl } = req.body;

      const proposal = await prisma.proposal.create({
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

      return res.status(201).json(proposal);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao criar proposta.' });
    }
  }

  async list(req: Request, res: Response) {
    try {
      const user = req.user as any;
      const realEstateId = user?.realEstateId || user?.id;
      
      const proposals = await prisma.proposal.findMany({
        where: { realEstateId },
        include: {
          property: { select: { title: true, address: true, transaction: true } },
          client: { select: { name: true, document: true, clientType: true } },
          broker: { select: { name: true } }
        },
        orderBy: { createdAt: 'desc' }
      });

      return res.json(proposals);
    } catch (error) {
      return res.status(500).json({ error: 'Erro ao listar propostas.' });
    }
  }

  async updateStatus(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { status, documentUrl } = req.body;

      const dataToUpdate: any = { status };
      if (documentUrl !== undefined) dataToUpdate.documentUrl = documentUrl;

      const proposal = await prisma.proposal.update({
        where: { id },
        data: dataToUpdate
      });

      return res.json(proposal);
    } catch (error) {
      return res.status(500).json({ error: 'Erro ao atualizar proposta.' });
    }
  }
}