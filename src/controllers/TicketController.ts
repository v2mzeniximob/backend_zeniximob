import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient() as any;

export class TicketController {
  
  // Criar um chamado (Pode ser criado pelo Inquilino/Proprietário no portal ou Corretor no CRM)
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

      // Se for inquilino, vincula o ID dele. Se for proprietário, o vinculo já é feito pelo propertyId
      if (isTenant) {
        ticketData.clientId = user.id;
      } else if (!user?.role) {
        // Se veio do CRM e mandou clientId
        if (clientId) ticketData.clientId = clientId;
      }

      const ticket = await prisma.ticket.create({
        data: ticketData
      });
      
      return res.status(201).json(ticket);
    } catch (error) {
      console.error('Erro ao criar ticket:', error);
      return res.status(500).json({ error: 'Erro ao criar ticket.' });
    }
  }

  // Listar chamados da Imobiliária (Para o CRM)
  async list(req: Request, res: Response) {
    try {
      const user = req.user as any;
      const realEstateId = user?.realEstateId || user?.id;

      const tickets = await prisma.ticket.findMany({
        where: { property: { realEstateId } },
        include: {
          property: { select: { title: true, address: true } },
          client: { select: { name: true, phone: true } },
          // Se tiver relação com owner no schema, pode descomentar a linha abaixo:
          // owner: { select: { name: true, phone: true } }
        },
        orderBy: { createdAt: 'desc' }
      });
      return res.json(tickets);
    } catch (error) {
      console.error('Erro ao listar tickets:', error);
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
      console.error('Erro ao atualizar ticket:', error);
      return res.status(500).json({ error: 'Erro ao atualizar ticket.' });
    }
  }
}