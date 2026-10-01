import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export class LeadController {
  
  // 1. Criar um novo Lead (Cliente)
  async create(req: Request, res: Response) {
    try {
      const user = req.user as any;
      const realEstateId = user?.realEstateId || user?.id;
      if (!realEstateId) return res.status(403).json({ error: 'Acesso negado.' });

      const { name, phone, email, interest, notes, propertyId, brokerId } = req.body;

      const lead = await (prisma as any).lead.create({
        data: {
          name, 
          phone, 
          email, 
          interest, 
          notes,
          stage: 'Novo', // O Lead entra sempre como "Novo" no funil
          propertyId: propertyId || null,
          brokerId: brokerId || null,
          realEstateId
        }
      });

      // NOVO: Regista automaticamente o primeiro evento no histórico do cliente
      await (prisma as any).leadHistory.create({
        data: {
          leadId: lead.id,
          actionType: 'Sistema',
          description: 'Lead cadastrado no sistema.'
        }
      });

      return res.status(201).json(lead);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao criar lead.' });
    }
  }

  // 2. Listar todos os Leads da imobiliária (com filtros opcionais)
  async list(req: Request, res: Response) {
    try {
      const user = req.user as any;
      const realEstateId = user?.realEstateId || user?.id;
      if (!realEstateId) return res.status(403).json({ error: 'Acesso negado.' });

      // Permite filtrar por corretor ou estágio (para montar os quadros Kanban no front-end depois)
      const { brokerId, stage } = req.query;

      const whereClause: any = { realEstateId };
      if (brokerId) whereClause.brokerId = brokerId;
      if (stage) whereClause.stage = stage;

      const leads = await (prisma as any).lead.findMany({
        where: whereClause,
        include: {
          property: { select: { title: true, type: true, category: true, transaction: true, price: true } },
          broker: { select: { name: true } },
          history: { orderBy: { date: 'desc' } } // Traz o histórico mais recente primeiro
        },
        orderBy: { updatedAt: 'desc' }
      });

      return res.json(leads);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao listar leads.' });
    }
  }

  // 3. Atualizar Dados Básicos ou Estágio do Funil
  async update(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const user = req.user as any;
      const realEstateId = user?.realEstateId || user?.id;
      if (!realEstateId) return res.status(403).json({ error: 'Acesso negado.' });

      const existingLead = await (prisma as any).lead.findUnique({ where: { id } });
      if (!existingLead || existingLead.realEstateId !== realEstateId) {
        return res.status(404).json({ error: 'Lead não encontrado.' });
      }

      const { name, phone, email, interest, stage, notes, propertyId, brokerId } = req.body;

      // Verifica se houve mudança de estágio no funil para gravar no histórico
      if (stage && stage !== existingLead.stage) {
        await (prisma as any).leadHistory.create({
          data: {
            leadId: id,
            actionType: 'Mudança de Estágio',
            description: `Lead movido de "${existingLead.stage}" para "${stage}".`
          }
        });
      }

      const updatedLead = await (prisma as any).lead.update({
        where: { id },
        data: { name, phone, email, interest, stage, notes, propertyId, brokerId }
      });

      return res.json(updatedLead);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao atualizar lead.' });
    }
  }

  // ==========================================
  // NOVOS MÉTODOS DO CRM (HISTÓRICO E MATCH)
  // ==========================================

  // 4. Adicionar um evento ao Histórico (ex: "Liguei para o cliente e ele gostou da casa")
  async addHistoryEvent(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { actionType, description } = req.body;
      const user = req.user as any;
      const realEstateId = user?.realEstateId || user?.id;

      const lead = await (prisma as any).lead.findUnique({ where: { id: id } });
      if (!lead || lead.realEstateId !== realEstateId) {
        return res.status(404).json({ error: 'Lead não encontrado.' });
      }

      const historyEvent = await (prisma as any).leadHistory.create({
        data: {
          leadId: id,
          actionType,   // "WhatsApp", "Ligação", "E-mail", "Visita", "Anotação"
          description
        }
      });

      // Atualiza a data do Lead para ele subir na lista de "recentes"
      await (prisma as any).lead.update({ where: { id: id }, data: { updatedAt: new Date() } });

      return res.status(201).json(historyEvent);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao adicionar histórico.' });
    }
  }
}