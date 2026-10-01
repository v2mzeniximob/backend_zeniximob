import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export class OwnerController {
  
  async create(req: Request, res: Response) {
    try {
      const user = req.user as any;
      const realEstateId = user?.realEstateId || user?.id;
      if (!realEstateId) return res.status(403).json({ error: 'Acesso negado.' });

      const { name, cpfOrCnpj, email, phone, bankData, managementContractUrl } = req.body;

      const ownerExists = await (prisma as any).owner.findFirst({
        where: { cpfOrCnpj, realEstateId }
      });

      if (ownerExists) return res.status(400).json({ error: 'Proprietário já cadastrado.' });

      const owner = await (prisma as any).owner.create({
        data: { name, cpfOrCnpj, email, phone, bankData, managementContractUrl, realEstateId }
      });

      return res.status(201).json(owner);
    } catch (error) {
      return res.status(500).json({ error: 'Erro ao registar proprietário.' });
    }
  }

  async list(req: Request, res: Response) {
    try {
      const user = req.user as any;
      const realEstateId = user?.realEstateId || user?.id;
      if (!realEstateId) return res.status(403).json({ error: 'Acesso negado.' });

      const owners = await (prisma as any).owner.findMany({
        where: { realEstateId },
        include: {
          // A MAGIA AQUI: Traz os imóveis do dono, a vistoria inicial deles, e os contratos de aluguel ativos!
          properties: {
            select: {
              id: true, title: true, inspectionUrl: true, rentStatus: true,
              contracts: {
                where: { status: 'Ativo' },
                include: { tenant: { select: { name: true, phone: true } } }
              }
            }
          }
        },
        orderBy: { name: 'asc' }
      });

      return res.json(owners);
    } catch (error) {
      return res.status(500).json({ error: 'Erro ao listar proprietários.' });
    }
  }

  async update(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { name, cpfOrCnpj, email, phone, bankData, managementContractUrl } = req.body;
      const updatedOwner = await (prisma as any).owner.update({
        where: { id },
        data: { name, cpfOrCnpj, email, phone, bankData, managementContractUrl }
      });
      return res.json(updatedOwner);
    } catch (error) {
      return res.status(500).json({ error: 'Erro ao atualizar proprietário.' });
    }
  }

  async toggleStatus(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const owner = await (prisma as any).owner.findUnique({ where: { id } });
      const updated = await (prisma as any).owner.update({
        where: { id }, data: { isActive: !owner.isActive }
      });
      return res.json(updated);
    } catch (error) {
      return res.status(500).json({ error: 'Erro ao alterar status.' });
    }
  }
}