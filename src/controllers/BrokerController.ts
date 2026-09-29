import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient() as any;

// Função auxiliar para garantir o isolamento por imobiliária
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

export class BrokerController {
  
  // Listar todos os corretores da imobiliária logada
  async list(req: Request, res: Response) {
    try {
      const realEstateId = await getRealEstateId(req);
      if (!realEstateId) return res.status(401).json({ error: 'Não autorizado.' });

      const brokers = await prisma.broker.findMany({
        where: { realEstateId },
        orderBy: { createdAt: 'desc' }
      });
      return res.json(brokers);
    } catch (error) {
      return res.status(500).json({ error: 'Erro ao listar corretores.' });
    }
  }

  // Criar novo corretor
  async create(req: Request, res: Response) {
    try {
      const realEstateId = await getRealEstateId(req);
      if (!realEstateId) return res.status(401).json({ error: 'Não autorizado.' });

      const { name, cpf, creci, phone, email, password } = req.body;

      // Verifica se já existe email ou cpf cadastrado
      const existing = await prisma.broker.findFirst({
        where: { OR: [{ email }, { cpf }] }
      });

      if (existing) {
        return res.status(400).json({ error: 'Já existe um corretor com este E-mail ou CPF.' });
      }

      const hashedPassword = await bcrypt.hash(password, 8);
      
      const broker = await prisma.broker.create({
        data: { name, cpf, creci, phone, email, password: hashedPassword, realEstateId }
      });
      
      return res.status(201).json(broker);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao criar corretor.' });
    }
  }

  // Atualizar dados do corretor
  async update(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const realEstateId = await getRealEstateId(req);
      if (!realEstateId) return res.status(401).json({ error: 'Não autorizado.' });

      const { name, cpf, creci, phone, email, password } = req.body;
      const dataToUpdate: any = { name, cpf, creci, phone, email };

      // Se a senha foi preenchida, gera o hash
      if (password && password.trim() !== '') {
        dataToUpdate.password = await bcrypt.hash(password, 8);
      }

      const updated = await prisma.broker.update({
        where: { id, realEstateId }, // Garante que a loja só edita os seus próprios corretores
        data: dataToUpdate
      });
      
      return res.json(updated);
    } catch (error) {
      return res.status(500).json({ error: 'Erro ao atualizar corretor.' });
    }
  }

  // Ativar ou desativar corretor
  async toggleStatus(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const realEstateId = await getRealEstateId(req);
      if (!realEstateId) return res.status(401).json({ error: 'Não autorizado.' });

      const broker = await prisma.broker.findUnique({ where: { id, realEstateId } });
      if (!broker) return res.status(404).json({ error: 'Corretor não encontrado.' });
      
      const updated = await prisma.broker.update({
        where: { id },
        data: { isActive: !broker.isActive }
      });
      
      return res.json(updated);
    } catch (error) {
      return res.status(500).json({ error: 'Erro ao alterar status.' });
    }
  }
}