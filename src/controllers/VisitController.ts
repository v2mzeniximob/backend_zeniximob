import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient() as any;

export class VisitController {
  
  // 1. CRIAR VISITA (Agendamento)
  async create(req: Request, res: Response) {
    try {
      const user = req.user as any;
      const realEstateId = user?.realEstateId || user?.id;
      if (!realEstateId) return res.status(403).json({ error: 'Acesso negado.' });

      const { date, propertyId, brokerId, status, feedback } = req.body;

      if (!propertyId || !brokerId || !date) {
        return res.status(400).json({ error: 'Data, Imóvel e Corretor são obrigatórios.' });
      }

      // Verifica se o imóvel pertence à imobiliária
      const property = await prisma.property.findFirst({
        where: { id: propertyId, realEstateId }
      });

      if (!property) return res.status(404).json({ error: 'Imóvel não encontrado.' });

      const visit = await prisma.visit.create({
        data: {
          date: new Date(date),
          propertyId,
          brokerId,
          status: status || 'Agendada',
          feedback
        }
      });

      return res.status(201).json(visit);
    } catch (error) {
      console.error('Erro ao agendar visita:', error);
      return res.status(500).json({ error: 'Erro ao agendar visita.' });
    }
  }

  // 2. LISTAR VISITAS
  async list(req: Request, res: Response) {
    try {
      const user = req.user as any;
      const realEstateId = user?.realEstateId || user?.id;
      if (!realEstateId) return res.status(403).json({ error: 'Acesso negado.' });

      const status = req.query.status as string;

      const whereClause: any = {
        property: { realEstateId }
      };

      if (status) {
        whereClause.status = status;
      }

      const visits = await prisma.visit.findMany({
        where: whereClause,
        include: {
          // CORREÇÃO: Bloco do "lead" foi removido daqui! 
          property: {
            select: {
              title: true,
              address: true,
              rentStatus: true
            }
          },
          broker: {
            select: {
              name: true
            }
          }
        },
        orderBy: { date: 'asc' }
      });

      return res.json(visits);
    } catch (error) {
      console.error('Erro ao listar visitas:', error);
      return res.status(500).json({ error: 'Erro ao listar visitas.' });
    }
  }

  // 3. ATUALIZAR VISITA (Ex: Marcar como Realizada ou Cancelada)
  async updateStatus(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { date, status, feedback, brokerId } = req.body;
      const user = req.user as any;
      const realEstateId = user?.realEstateId || user?.id;

      // Verifica se a visita existe e se o imóvel pertence à imobiliária
      const visit = await prisma.visit.findUnique({
        where: { id },
        include: { property: true }
      });

      if (!visit || visit.property.realEstateId !== realEstateId) {
         return res.status(404).json({ error: 'Visita não encontrada.' });
      }

      // Prepara os dados para atualizar apenas o que foi enviado
      const updatedData: any = {};
      if (date) updatedData.date = new Date(date);
      if (status) updatedData.status = status;
      if (feedback !== undefined) updatedData.feedback = feedback;
      if (brokerId) updatedData.brokerId = brokerId;

      const updatedVisit = await prisma.visit.update({
        where: { id },
        data: updatedData
      });

      return res.json(updatedVisit);
    } catch (error) {
      console.error('Erro ao atualizar visita:', error);
      return res.status(500).json({ error: 'Erro ao atualizar visita.' });
    }
  }
}