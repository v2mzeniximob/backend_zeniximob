import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient() as any;

export class TicketController {
  
  // Criar um chamado original
  async create(req: Request, res: Response) {
    try {
      const { title, description, priority, imageUrl, propertyId, clientId } = req.body;
      const user = req.user as any; 

      const isTenant = user?.role === 'CLIENT' || user?.role === 'INQUILINO';

      const ticketData: any = {
        title, 
        description, 
        priority: priority || 'Média', 
        imageUrl,
        propertyId
      };

      if (isTenant) {
        ticketData.clientId = user.id;
      } else if (!user?.role) {
        if (clientId) ticketData.clientId = clientId;
      }

      const ticket = await prisma.ticket.create({ data: ticketData });
      return res.status(201).json(ticket);
    } catch (error) {
      console.error('Erro ao criar ticket:', error);
      return res.status(500).json({ error: 'Erro ao criar ticket.' });
    }
  }

  // ==========================================
  // NOVA FUNÇÃO: Adicionar interação ao chamado
  // ==========================================
  async addMessage(req: Request, res: Response) {
    try {
      const { id } = req.params; // ID do Ticket
      const { message } = req.body;
      const user = req.user as any;

      // Define quem está a enviar a mensagem
      let sender = 'ADMIN'; // Padrão é a imobiliária
      if (user?.role === 'CLIENT' || user?.role === 'INQUILINO') sender = 'CLIENT';
      if (user?.role === 'OWNER' || user?.role === 'PROPRIETARIO') sender = 'OWNER';

      const newMessage = await prisma.ticketMessage.create({
        data: {
          ticketId: id,
          message,
          sender
        }
      });

      return res.status(201).json(newMessage);
    } catch (error) {
      console.error('Erro ao adicionar mensagem:', error);
      return res.status(500).json({ error: 'Erro ao adicionar mensagem ao chamado.' });
    }
  }

  // Listar chamados da Imobiliária (ATUALIZADO PARA INCLUIR MENSAGENS)
  async list(req: Request, res: Response) {
    try {
      const user = req.user as any;
      const realEstateId = user?.realEstateId || user?.id;

      const tickets = await prisma.ticket.findMany({
        where: { property: { realEstateId } },
        include: {
          property: { select: { title: true, address: true } },
          client: { select: { name: true, phone: true } },
          messages: { orderBy: { createdAt: 'asc' } }
        },
        orderBy: { createdAt: 'desc' }
      });
      return res.json(tickets);
    } catch (error) {
      console.error('Erro ao listar tickets:', error);
      return res.status(500).json({ error: 'Erro ao listar tickets.' });
    }
  }

  // Atualizar Status do Ticket
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
      console.error('Erro ao atualizar ticket:', error);
      return res.status(500).json({ error: 'Erro ao atualizar ticket.' });
    }
  }
}