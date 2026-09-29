import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient() as any;

async function getRealEstateId(req: Request): Promise<string | null> {
  const reqAny = req as any;
  if (reqAny.realEstateId) return reqAny.realEstateId;
  if (reqAny.user?.realEstateId) return reqAny.user.realEstateId;

  const userId = reqAny.userId || reqAny.user?.id;
  if (!userId) return null;

  // Verifica se o ID logado é diretamente uma Imobiliária
  const store = await prisma.realEstate.findUnique({ where: { id: userId } });
  if (store) return store.id;

  // Verifica se o ID logado é de um Corretor
  const broker = await prisma.broker.findUnique({ where: { id: userId } });
  if (broker) return broker.realEstateId;

  return null;
}

export class LeadController {
  async list(req: Request, res: Response) {
    try {
      const realEstateId = await getRealEstateId(req);
      if (!realEstateId) {
        return res.status(401).json({ error: 'Imobiliária não identificada no token.' });
      }

      const leads = await prisma.lead.findMany({
        where: { realEstateId },
        include: { property: true },
        orderBy: { createdAt: 'desc' }
      });
      return res.json(leads);
    } catch (error) {
      return res.status(500).json({ error: 'Erro ao buscar leads.' });
    }
  }

  async create(req: Request, res: Response) {
    try {
      const realEstateId = await getRealEstateId(req);
      if (!realEstateId) {
        return res.status(401).json({ error: 'Imobiliária não identificada no token.' });
      }

      const { name, phone, email, interest, status, propertyId, notes } = req.body;
      const lead = await prisma.lead.create({
        data: {
          name,
          phone,
          email,
          interest,
          status: status || 'Novo',
          notes,
          propertyId: propertyId || null,
          realEstateId
        }
      });
      return res.status(201).json(lead);
    } catch (error) {
      return res.status(500).json({ error: 'Erro ao criar lead.' });
    }
  }

  async update(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const realEstateId = await getRealEstateId(req);
      if (!realEstateId) {
        return res.status(401).json({ error: 'Imobiliária não identificada no token.' });
      }

      const { name, phone, email, interest, status, propertyId, notes } = req.body;
      const lead = await prisma.lead.update({
        where: { id, realEstateId },
        data: { name, phone, email, interest, status, propertyId: propertyId || null, notes }
      });
      return res.json(lead);
    } catch (error) {
      return res.status(500).json({ error: 'Erro ao atualizar lead.' });
    }
  }
}