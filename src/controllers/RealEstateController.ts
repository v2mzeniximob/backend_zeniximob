import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

export class RealEstateController {
  
  // 1. CRIAR IMOBILIÁRIA (LOJA)
  async create(req: Request, res: Response): Promise<any> {
    try {
      const {
        cnpj, corporateName, tradeName, stateRegistration, cityRegistration,
        cep, address, phone,
        respName, respCpf, respAddress, respPhone,
        email, password, contractUrl, planId, franchiseeId
      } = req.body;

      // Validações obrigatórias
      if (!planId) {
        return res.status(400).json({ error: 'É obrigatório selecionar um plano.' });
      }

      // Verifica duplicidade
      const alreadyExists = await prisma.realEstate.findFirst({
        where: { OR: [{ cnpj }, { email }] }
      });

      if (alreadyExists) {
        return res.status(400).json({ error: 'Já existe uma imobiliária com este CNPJ ou E-mail.' });
      }

      // Criptografar a senha de acesso da imobiliária
      const hashedPassword = await bcrypt.hash(password, 10);

      const realEstate = await prisma.realEstate.create({
        data: {
          cnpj, corporateName, tradeName, stateRegistration, cityRegistration,
          cep, address, phone,
          respName, respCpf, respAddress, respPhone,
          email, password: hashedPassword,
          contractUrl: contractUrl || null,
          planId,
          franchiseeId: franchiseeId || null // Se não vier, pertence direto ao Master
        }
      });

      const { password: _, ...safeData } = realEstate;
      return res.status(201).json(safeData);

    } catch (error) {
      console.error('Erro ao criar imobiliária:', error);
      return res.status(500).json({ error: 'Erro interno ao criar imobiliária.' });
    }
  }

  // 2. LISTAR IMOBILIÁRIAS
  async list(req: Request, res: Response): Promise<any> {
    try {
      // O Master vê todas as imobiliárias cadastradas, incluindo os dados do plano e do franqueado
      const realEstates = await prisma.realEstate.findMany({
        orderBy: { createdAt: 'desc' },
        select: {
          id: true, cnpj: true, tradeName: true, email: true, phone: true, 
          isActive: true, contractUrl: true, createdAt: true,
          plan: { select: { id: true, name: true, price: true } },
          franchisee: { select: { id: true, tradeName: true } }
        }
      });
      return res.json(realEstates);
    } catch (error) {
      console.error('Erro ao listar imobiliárias:', error);
      return res.status(500).json({ error: 'Erro interno ao listar imobiliárias.' });
    }
  }

  // 3. EDITAR IMOBILIÁRIA (e vincular a franqueado)
  async update(req: Request, res: Response): Promise<any> {
    try {
      const id = req.params.id as string;
      const dataToUpdate = req.body;

      if (dataToUpdate.password) {
        dataToUpdate.password = await bcrypt.hash(dataToUpdate.password, 10);
      }

      const updatedRealEstate = await prisma.realEstate.update({
        where: { id },
        data: dataToUpdate,
        include: {
          plan: true,
          franchisee: true
        }
      });

      const { password: _, ...safeData } = updatedRealEstate;
      return res.json(safeData);
    } catch (error) {
      console.error('Erro ao atualizar imobiliária:', error);
      return res.status(500).json({ error: 'Erro ao atualizar imobiliária.' });
    }
  }

  // 4. ATIVAR / INATIVAR IMOBILIÁRIA
  async toggleStatus(req: Request, res: Response): Promise<any> {
    try {
      const id = req.params.id as string;
      const realEstate = await prisma.realEstate.findUnique({ where: { id } });
      
      if (!realEstate) {
        return res.status(404).json({ error: 'Imobiliária não encontrada.' });
      }

      const updated = await prisma.realEstate.update({
        where: { id },
        data: { isActive: !realEstate.isActive }
      });

      return res.json({ message: 'Status alterado com sucesso', isActive: updated.isActive });
    } catch (error) {
      console.error('Erro ao alterar status da imobiliária:', error);
      return res.status(500).json({ error: 'Erro ao alterar status.' });
    }
  }
}