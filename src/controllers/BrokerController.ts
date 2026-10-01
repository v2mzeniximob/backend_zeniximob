import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

export class BrokerController {
  
  async create(req: Request, res: Response) {
    try {
      const user = req.user as any;
      const realEstateId = user?.realEstateId || user?.id;
      if (!realEstateId) return res.status(403).json({ error: 'Acesso negado.' });

      const { name, email, cpf, creci, phone, password, profileImageUrl } = req.body;

      const brokerExists = await (prisma as any).broker.findFirst({
        where: { OR: [{ email }, { cpf }, { creci }] }
      });

      if (brokerExists) {
        return res.status(400).json({ error: 'Corretor já cadastrado com este E-mail, CPF ou CRECI.' });
      }

      const hashedPassword = await bcrypt.hash(password || '123456', 10);

      const broker = await (prisma as any).broker.create({
        data: {
          name,
          email,
          cpf,
          creci,
          phone,
          password: hashedPassword,
          profileImageUrl, // Nova foto do corretor
          realEstateId
        }
      });

      // Remove a password do retorno por segurança
      broker.password = undefined;
      return res.status(201).json(broker);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao criar corretor.' });
    }
  }

  async list(req: Request, res: Response) {
    try {
      const user = req.user as any;
      const realEstateId = user?.realEstateId || user?.id;
      if (!realEstateId) return res.status(403).json({ error: 'Acesso negado.' });

      const brokers = await (prisma as any).broker.findMany({
        where: { realEstateId },
        orderBy: { name: 'asc' },
        select: {
          id: true, name: true, email: true, cpf: true, creci: true, 
          phone: true, profileImageUrl: true, isActive: true, createdAt: true
        }
      });

      return res.json(brokers);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao listar corretores.' });
    }
  }

  async update(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const user = req.user as any;
      const realEstateId = user?.realEstateId || user?.id;
      if (!realEstateId) return res.status(403).json({ error: 'Acesso negado.' });

      const { name, email, cpf, creci, phone, password, profileImageUrl } = req.body;

      const dataToUpdate: any = { name, email, cpf, creci, phone, profileImageUrl };

      if (password) {
        dataToUpdate.password = await bcrypt.hash(password, 10);
      }

      const broker = await (prisma as any).broker.update({
        where: { id_realEstateId: { id, realEstateId } }, // Garante que atualiza apenas corretores da própria loja
        data: dataToUpdate
      });

      broker.password = undefined;
      return res.json(broker);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao atualizar corretor.' });
    }
  }

  async toggleStatus(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const user = req.user as any;
      const realEstateId = user?.realEstateId || user?.id;
      if (!realEstateId) return res.status(403).json({ error: 'Acesso negado.' });

      const broker = await (prisma as any).broker.findUnique({
        where: { id_realEstateId: { id, realEstateId } }
      });
      
      if (!broker) return res.status(404).json({ error: 'Corretor não encontrado.' });

      const updated = await (prisma as any).broker.update({
        where: { id },
        data: { isActive: !broker.isActive }
      });

      return res.json(updated);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao alterar status.' });
    }
  }
}