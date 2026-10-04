// Caminho: src/controllers/TicketController.ts
import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient() as any;

export class TicketController {
  
  // Criar um chamado (Pode ser criado pelo Inquilino no portal ou pelo Corretor no CRM)
  async create(req: Request, res: Response) {
    try {
      const { title, description, priority, imageUrl, propertyId, clientId } = req.body;

      const ticket = await prisma.ticket.create({
        data: {
          title, description, priority: priority || 'Média', imageUrl,
          propertyId, clientId
        }
      });
      return res.status(201).json(ticket);
    } catch (error) {
      return res.status(500).json({ error: 'Erro ao criar ticket.' });
    }
  }

  // Listar chamados da Imobiliária
  async list(req: Request, res: Response) {
    try {
      const user = req.user as any;
      const realEstateId = user?.realEstateId || user?.id;

      const tickets = await prisma.ticket.findMany({
        where: { property: { realEstateId } },
        include: {
          property: { select: { title: true, address: true } },
          client: { select: { name: true, phone: true } }
        },
        orderBy: { createdAt: 'desc' }
      });
      return res.json(tickets);
    } catch (error) {
      return res.status(500).json({ error: 'Erro ao listar tickets.' });
    }
  }

  // Atualizar Status do Ticket (Aberto -> Em Andamento -> Concluído)
  async updateStatus(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { status } = req.body;

      const ticket = await prisma.ticket.update({
        where: { id },
        data: { status }
      });
      return res.json(ticket);
    } catch (error) {
      return res.status(500).json({ error: 'Erro ao atualizar ticket.' });
    }
  }
}