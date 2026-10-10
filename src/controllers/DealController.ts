import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient() as any;

async function getRealEstateId(req: Request): Promise<string | null> {
  const reqAny = req as any;
  if (reqAny.realEstateId) return reqAny.realEstateId;
  if (reqAny.user?.realEstateId) return reqAny.user.realEstateId;
  const userId = reqAny.userId || reqAny.user?.id;
  if (!userId) return null;
  const store = await prisma.realEstate.findUnique({ where: { id: userId } });
  if (store) return store.id;
  const broker = await prisma.broker.findUnique({ where: { id: userId } });
  if (broker) return broker.realEstateId;
  return null;
}

export class DealController {
  
  // ==========================================
  // GESTÃO DAS COLUNAS (STAGES) DO KANBAN
  // ==========================================
  
  async listStages(req: Request, res: Response) {
    try {
      const realEstateId = await getRealEstateId(req);
      if (!realEstateId) return res.status(403).json({ error: 'Acesso negado.' });

      // Se a imobiliária não tiver colunas, cria as colunas padrão automaticamente!
      const count = await prisma.pipelineStage.count({ where: { realEstateId } });
      
      if (count === 0) {
        await prisma.pipelineStage.createMany({
          data: [
            { name: 'Em Análise', orderIndex: 0, colorCode: '#3B82F6', realEstateId },
            { name: 'Proposta / Negociação', orderIndex: 1, colorCode: '#F59E0B', realEstateId },
            { name: 'Documentação / Contrato', orderIndex: 2, colorCode: '#8B5CF6', realEstateId },
            { name: 'Fechado / Ganho', orderIndex: 3, colorCode: '#10B981', realEstateId },
          ]
        });
      }

      // Busca as colunas ordenadas e já traz todos os negócios (deals) dentro de cada uma
      const stages = await prisma.pipelineStage.findMany({
        where: { realEstateId },
        orderBy: { orderIndex: 'asc' },
        include: {
          deals: {
            include: {
              lead: { select: { id: true, name: true, phone: true } },
              property: { select: { id: true, title: true, imageUrls: true, transaction: true } },
              broker: { select: { id: true, name: true, profileImageUrl: true } }
            },
            orderBy: { updatedAt: 'desc' }
          }
        }
      });

      return res.json(stages);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao listar o Kanban.' });
    }
  }

  async createStage(req: Request, res: Response) {
    try {
      const realEstateId = await getRealEstateId(req);
      if (!realEstateId) return res.status(403).json({ error: 'Acesso negado.' });

      const { name, orderIndex, colorCode } = req.body;

      const stage = await prisma.pipelineStage.create({
        data: { name, orderIndex: Number(orderIndex), colorCode, realEstateId }
      });

      return res.status(201).json(stage);
    } catch (error) {
      return res.status(500).json({ error: 'Erro ao criar coluna do Kanban.' });
    }
  }

  // ==========================================
  // GESTÃO DOS NEGÓCIOS / CARDS (DEALS)
  // ==========================================

  async createDeal(req: Request, res: Response) {
    try {
      const realEstateId = await getRealEstateId(req);
      if (!realEstateId) return res.status(403).json({ error: 'Acesso negado.' });

      const { title, transactionType, agreedPrice, stageId, leadId, propertyId, brokerId } = req.body;

      const deal = await prisma.deal.create({
        data: {
          title,
          transactionType,
          agreedPrice: agreedPrice ? Number(agreedPrice) : null,
          stageId,
          leadId,
          propertyId,
          brokerId,
          realEstateId
        },
        include: {
          lead: true,
          property: true,
          broker: true
        }
      });

      return res.status(201).json(deal);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao criar negócio.' });
    }
  }

  async updateDeal(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const realEstateId = await getRealEstateId(req);
      if (!realEstateId) return res.status(403).json({ error: 'Acesso negado.' });

      const { title, transactionType, agreedPrice, status } = req.body;

      const deal = await prisma.deal.update({
        where: { id, realEstateId },
        data: {
          title,
          transactionType,
          agreedPrice: agreedPrice ? Number(agreedPrice) : undefined,
          status
        }
      });

      return res.json(deal);
    } catch (error) {
      return res.status(500).json({ error: 'Erro ao atualizar negócio.' });
    }
  }

  // Método Otimizado para o Drag-and-Drop
  async moveDeal(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const realEstateId = await getRealEstateId(req);
      if (!realEstateId) return res.status(403).json({ error: 'Acesso negado.' });

      const { newStageId } = req.body;

      // Atualiza o estágio do negócio no banco
      const deal = await prisma.deal.update({
        where: { id, realEstateId },
        data: { stageId: newStageId }
      });

      return res.json(deal);
    } catch (error) {
      return res.status(500).json({ error: 'Erro ao mover card no Kanban.' });
    }
  }

  async deleteDeal(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const realEstateId = await getRealEstateId(req);
      if (!realEstateId) return res.status(403).json({ error: 'Acesso negado.' });

      await prisma.deal.delete({
        where: { id, realEstateId }
      });

      return res.status(204).send();
    } catch (error) {
      return res.status(500).json({ error: 'Erro ao excluir negócio.' });
    }
  }
}