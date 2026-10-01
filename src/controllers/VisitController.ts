import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export class VisitController {
  
  async create(req: Request, res: Response) {
    try {
      const user = req.user as any;
      const realEstateId = user?.realEstateId || user?.id;
      if (!realEstateId) return res.status(403).json({ error: 'Acesso negado.' });

      const { leadId, propertyId, brokerId, date, notes } = req.body;

      const visit = await (prisma as any).visit.create({
        data: {
          leadId,
          propertyId,
          brokerId: brokerId || null,
          date: new Date(date),
          notes,
          status: 'Agendada'
        }
      });

      return res.status(201).json(visit);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao agendar visita.' });
    }
  }

  async list(req: Request, res: Response) {
    try {
      const user = req.user as any;
      const realEstateId = user?.realEstateId || user?.id;
      if (!realEstateId) return res.status(403).json({ error: 'Acesso negado.' });

      const visits = await (prisma as any).visit.findMany({
        where: {
          property: { realEstateId }
        },
        include: {
          lead: { select: { name: true, phone: true } },
          property: { select: { title: true, address: true, rentStatus: true } },
          broker: { select: { name: true } }
        },
        orderBy: { date: 'asc' } // Ordena pelas mais próximas
      });

      return res.json(visits);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao listar visitas.' });
    }
  }

  async updateStatus(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { status, feedback } = req.body;

      const updatedVisit = await (prisma as any).visit.update({
        where: { id },
        data: { status, feedback }
      });

      // MAGIA: Se o corretor preencheu um feedback, regista isso no Histórico do Lead no CRM!
      if (feedback && updatedVisit.leadId) {
        await (prisma as any).leadHistory.create({
          data: {
            leadId: updatedVisit.leadId,
            actionType: 'Visita',
            description: `Visita ${status.toUpperCase()}: ${feedback}`,
            date: new Date()
          }
        });
      }

      return res.json(updatedVisit);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao atualizar visita.' });
    }
  }
}