import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

export class FranchiseeController {
  
  // 1. CRIAR FRANQUEADO
  async create(req: Request, res: Response): Promise<any> {
    try {
      const {
        cnpj, corporateName, tradeName, stateRegistration, cityRegistration,
        cep, address, phone,
        respName, respCpf, respAddress, respPhone,
        email, password, contractUrl
      } = req.body;

      // Verifica se o CNPJ ou E-mail já existem no banco
      const alreadyExists = await prisma.franchisee.findFirst({
        where: { OR: [{ cnpj }, { email }] }
      });

      if (alreadyExists) {
        return res.status(400).json({ error: 'Já existe um franqueado cadastrado com este CNPJ ou E-mail.' });
      }

      // Criptografar a senha do franqueado
      const hashedPassword = await bcrypt.hash(password, 10);

      const franchisee = await prisma.franchisee.create({
        data: {
          cnpj, corporateName, tradeName, stateRegistration, cityRegistration,
          cep, address, phone,
          respName, respCpf, respAddress, respPhone,
          email, password: hashedPassword,
          contractUrl: contractUrl || null // Aqui futuramente virá a URL do S3/Cloudinary
        }
      });

      // Remove a senha do retorno por segurança
      const { password: _, ...franchiseeData } = franchisee;
      return res.status(201).json(franchiseeData);

    } catch (error) {
      console.error('Erro ao criar franqueado:', error);
      return res.status(500).json({ error: 'Erro interno ao criar franqueado.' });
    }
  }

  // 2. LISTAR TODOS OS FRANQUEADOS (Master)
  async list(req: Request, res: Response): Promise<any> {
    try {
      const franchisees = await prisma.franchisee.findMany({
        orderBy: { createdAt: 'desc' },
        select: { // Select garante que a senha NUNCA trafegue pela rede
          id: true, cnpj: true, corporateName: true, tradeName: true,
          email: true, phone: true, isActive: true, contractUrl: true, createdAt: true
        }
      });
      return res.json(franchisees);
    } catch (error) {
      return res.status(500).json({ error: 'Erro interno ao listar franqueados.' });
    }
  }

// 3. EDITAR FRANQUEADO
  async update(req: Request, res: Response): Promise<any> {
    try {
      const id = req.params.id as string; // Correção aqui
      const dataToUpdate = req.body;

      if (dataToUpdate.password) {
        dataToUpdate.password = await bcrypt.hash(dataToUpdate.password, 10);
      }

      const updatedFranchisee = await prisma.franchisee.update({
        where: { id },
        data: dataToUpdate
      });

      const { password: _, ...safeData } = updatedFranchisee;
      return res.json(safeData);
    } catch (error) {
      return res.status(500).json({ error: 'Erro ao atualizar franqueado.' });
    }
  }

  // 4. ATIVAR / INATIVAR FRANQUEADO
  async toggleStatus(req: Request, res: Response): Promise<any> {
    try {
      const id = req.params.id as string; // Correção aqui
      const franchisee = await prisma.franchisee.findUnique({ where: { id } });
      
      if (!franchisee) {
        return res.status(404).json({ error: 'Franqueado não encontrado.' });
      }

      const updated = await prisma.franchisee.update({
        where: { id },
        data: { isActive: !franchisee.isActive }
      });

      return res.json({ message: 'Status alterado com sucesso', isActive: updated.isActive });
    } catch (error) {
      return res.status(500).json({ error: 'Erro ao alterar status.' });
    }
  }
}