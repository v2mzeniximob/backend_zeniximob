import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient() as any;

export class KeyController {
  
  async list(req: Request, res: Response) {
    try {
      const user = req.user as any;
      const realEstateId = user?.realEstateId || user?.id;

      const properties = await prisma.property.findMany({
        where: { realEstateId },
        select: {
          id: true, title: true, address: true, keyCode: true, keyStatus: true,
          keyMovements: {
            where: { returnedAt: null },
            include: { 
              broker: { select: { name: true } },
              realEstate: { select: { name: true, tradeName: true } }
            }
          }
        },
        orderBy: { title: 'asc' }
      });

      return res.json(properties);
    } catch (error) {
      return res.status(500).json({ error: 'Erro ao listar quadro de chaves.' });
    }
  }

  async updateKeyCode(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { keyCode } = req.body;
      const property = await prisma.property.update({ where: { id }, data: { keyCode } });
      return res.json(property);
    } catch (error) {
      return res.status(500).json({ error: 'Erro ao atualizar tag.' });
    }
  }

  async withdraw(req: Request, res: Response) {
    try {
      const { propertyId, clientName, reason, notes } = req.body;
      const user = req.user as any;
      const realEstateId = user?.realEstateId || user?.id;
      const brokerId = user?.realEstateId ? user.id : null;

      const property = await prisma.property.findUnique({ where: { id: propertyId } });
      if (property.keyStatus === 'Retirada') return res.status(400).json({ error: 'Chave já retirada.' });

      const movement = await prisma.keyMovement.create({
        data: { propertyId, realEstateId, brokerId, clientName, reason, notes }
      });

      await prisma.property.update({ where: { id: propertyId }, data: { keyStatus: 'Retirada' } });

      return res.status(201).json(movement);
    } catch (error) {
      return res.status(500).json({ error: 'Erro ao retirar chave.' });
    }
  }

  async returnKey(req: Request, res: Response) {
    try {
      const { movementId } = req.params;
      const movement = await prisma.keyMovement.update({ where: { id: movementId }, data: { returnedAt: new Date() } });
      await prisma.property.update({ where: { id: movement.propertyId }, data: { keyStatus: 'Disponível' } });
      return res.json(movement);
    } catch (error) {
      return res.status(500).json({ error: 'Erro ao devolver chave.' });
    }
  }

  async history(req: Request, res: Response) {
    try {
      const { propertyId } = req.params;
      const history = await prisma.keyMovement.findMany({
        where: { propertyId },
        include: { broker: { select: { name: true } }, realEstate: { select: { name: true } } },
        orderBy: { withdrawnAt: 'desc' }
      });
      return res.json(history);
    } catch (error) {
      return res.status(500).json({ error: 'Erro ao buscar histórico.' });
    }
  }
}