import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient() as any;

export class OwnerController {
  
  // 1. CRIAR PROPRIETÁRIO
  async create(req: Request, res: Response) {
    try {
      const user = req.user as any;
      const realEstateId = user?.realEstateId || user?.id;
      if (!realEstateId) return res.status(403).json({ error: 'Acesso negado.' });

      const { name, cpfOrCnpj, email, phone, bankData, inspectionUrl, password } = req.body;
      
      // Encripta a senha se for enviada
      const hashedPassword = password ? await bcrypt.hash(password, 10) : null;

      const owner = await prisma.owner.create({ 
        data: { 
          name, cpfOrCnpj, email, phone, bankData, inspectionUrl, realEstateId,
          password: hashedPassword
        } 
      });
      
      return res.status(201).json(owner);
    } catch (error) { 
      console.error('Erro ao cadastrar proprietário:', error);
      return res.status(500).json({ error: 'Erro ao cadastrar proprietário.' }); 
    }
  }

  // 2. LISTAR PROPRIETÁRIOS
  async list(req: Request, res: Response) {
    try {
      const user = req.user as any;
      const realEstateId = user?.realEstateId || user?.id;
      
      const owners = await prisma.owner.findMany({
        where: { realEstateId }, 
        include: { properties: { select: { id: true, title: true } } }, 
        orderBy: { name: 'asc' }
      });
      return res.json(owners);
    } catch (error) { 
      console.error('Erro ao listar proprietários:', error);
      return res.status(500).json({ error: 'Erro ao listar proprietários.' }); 
    }
  }

  // 3. ATUALIZAR PROPRIETÁRIO
  async update(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { name, cpfOrCnpj, email, phone, bankData, managementContractUrl, inspectionUrl, password } = req.body;
      const user = req.user as any;
      const realEstateId = user?.realEstateId || user?.id;

      // Garante que o proprietário existe e pertence à imobiliária logada
      const owner = await prisma.owner.findFirst({
        where: { id, realEstateId }
      });

      if (!owner) {
        return res.status(404).json({ error: 'Proprietário não encontrado ou sem permissão.' });
      }

      const dataToUpdate: any = {
        name,
        cpfOrCnpj,
        email,
        phone,
        bankData,
        inspectionUrl,
        managementContractUrl: managementContractUrl !== undefined ? managementContractUrl : undefined
      };

      // Se enviou uma senha na atualização, encripta e salva
      if (password) {
        dataToUpdate.password = await bcrypt.hash(password, 10);
      }

      const updated = await prisma.owner.update({
        where: { id },
        data: dataToUpdate
      });

      return res.json(updated);
    } catch (error) {
      console.error('Erro ao atualizar proprietário:', error);
      return res.status(500).json({ error: 'Erro ao atualizar proprietário.' });
    }
  }

  // 4. ATIVAR / DESATIVAR PROPRIETÁRIO
  async toggleStatus(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const owner = await prisma.owner.findUnique({ where: { id } });
      
      if(!owner) return res.status(404).json({ error: 'Proprietário não encontrado.' });
      
      const updated = await prisma.owner.update({ 
        where: { id }, 
        data: { isActive: !owner.isActive } 
      });
      return res.json(updated);
    } catch (error) { 
      console.error('Erro ao alterar status:', error);
      return res.status(500).json({ error: 'Erro ao alterar status.' }); 
    }
  }
}