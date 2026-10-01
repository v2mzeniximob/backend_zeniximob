import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export class OwnerController {
  
  // 1. Criar novo Proprietário
  async create(req: Request, res: Response) {
    try {
      const user = req.user as any;
      const realEstateId = user?.realEstateId || user?.id;
      if (!realEstateId) return res.status(403).json({ error: 'Acesso negado.' });

      const { name, cpfOrCnpj, email, phone, bankData } = req.body;

      // Verifica se já existe um proprietário com o mesmo CPF/CNPJ nesta imobiliária
      const ownerExists = await (prisma as any).owner.findFirst({
        where: { cpfOrCnpj, realEstateId }
      });

      if (ownerExists) {
        return res.status(400).json({ error: 'Proprietário já cadastrado com este CPF/CNPJ.' });
      }

      const owner = await (prisma as any).owner.create({
        data: {
          name,
          cpfOrCnpj,
          email,
          phone,
          bankData, // Ex: "Banco Nubank, Ag 0001, CC 12345-6, Pix: 123.456..."
          realEstateId
        }
      });

      return res.status(201).json(owner);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao registar proprietário.' });
    }
  }

  // 2. Listar Proprietários
  async list(req: Request, res: Response) {
    try {
      const user = req.user as any;
      const realEstateId = user?.realEstateId || user?.id;
      if (!realEstateId) return res.status(403).json({ error: 'Acesso negado.' });

      const owners = await (prisma as any).owner.findMany({
        where: { realEstateId },
        orderBy: { name: 'asc' }
      });

      return res.json(owners);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao listar proprietários.' });
    }
  }

  // 3. Atualizar Proprietário
  async update(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const user = req.user as any;
      const realEstateId = user?.realEstateId || user?.id;
      if (!realEstateId) return res.status(403).json({ error: 'Acesso negado.' });

      const existingOwner = await (prisma as any).owner.findUnique({ where: { id } });
      if (!existingOwner || existingOwner.realEstateId !== realEstateId) {
        return res.status(404).json({ error: 'Proprietário não encontrado.' });
      }

      const { name, cpfOrCnpj, email, phone, bankData } = req.body;

      const updatedOwner = await (prisma as any).owner.update({
        where: { id },
        data: { name, cpfOrCnpj, email, phone, bankData }
      });

      return res.json(updatedOwner);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao atualizar proprietário.' });
    }
  }

  // 4. Ativar/Desativar Proprietário
  async toggleStatus(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const user = req.user as any;
      const realEstateId = user?.realEstateId || user?.id;
      if (!realEstateId) return res.status(403).json({ error: 'Acesso negado.' });

      const owner = await (prisma as any).owner.findUnique({ where: { id } });
      if (!owner || owner.realEstateId !== realEstateId) {
        return res.status(404).json({ error: 'Proprietário não encontrado.' });
      }

      const updated = await (prisma as any).owner.update({
        where: { id },
        data: { isActive: !owner.isActive }
      });

      return res.json(updated);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao alterar status do proprietário.' });
    }
  }
}