import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient() as any;

export class FranchiseeController {
  // 1. Criar Franqueado
  async create(req: Request, res: Response) {
    try {
      const data = req.body;
      
      if (!data.cnpj || !data.email || !data.password) {
        return res.status(400).json({ error: 'CNPJ, E-mail e Senha são obrigatórios.' });
      }

      const existing = await prisma.franchisee.findFirst({
        where: { OR: [{ email: data.email }, { cnpj: data.cnpj }] }
      });

      if (existing) {
        return res.status(400).json({ error: 'Já existe um franqueado com este E-mail ou CNPJ.' });
      }

      const hashedPassword = await bcrypt.hash(data.password, 8);

      const franchisee = await prisma.franchisee.create({
        data: {
          cnpj: data.cnpj,
          corporateName: data.corporateName,
          tradeName: data.tradeName,
          stateRegistration: data.stateRegistration || 'ISENTO',
          cityRegistration: data.cityRegistration || 'ISENTO',
          cep: data.cep,
          address: data.address,
          phone: data.phone,
          respName: data.respName,
          respCpf: data.respCpf,
          respPhone: data.respPhone,
          respAddress: data.respAddress,
          email: data.email,
          password: hashedPassword,
          contractUrl: data.contractUrl || null,
        }
      });

      return res.status(201).json(franchisee);
    } catch (error) {
      console.error('[FRANQUEADO_CREATE_ERROR]', error);
      return res.status(500).json({ error: 'Erro interno ao criar franqueado.' });
    }
  }

  // 2. Listar Franqueados (ESTE ERA O VILÃO QUE NÃO TRAZIA TODOS OS DADOS)
  async list(req: Request, res: Response) {
    try {
      // Retorna todos os dados de forma explícita e integral sem filtrar nada
      const franchisees = await prisma.franchisee.findMany({
        orderBy: { createdAt: 'desc' }
      });
      return res.json(franchisees);
    } catch (error) {
      console.error('[FRANQUEADO_LIST_ERROR]', error);
      return res.status(500).json({ error: 'Erro ao listar franqueados.' });
    }
  }

  // 3. Atualizar Franqueado
  async update(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const data = req.body;

      const dataToUpdate: any = {
        cnpj: data.cnpj,
        corporateName: data.corporateName,
        tradeName: data.tradeName,
        stateRegistration: data.stateRegistration || 'ISENTO',
        cityRegistration: data.cityRegistration || 'ISENTO',
        cep: data.cep,
        address: data.address,
        phone: data.phone,
        respName: data.respName,
        respCpf: data.respCpf,
        respPhone: data.respPhone,
        respAddress: data.respAddress,
        email: data.email,
        contractUrl: data.contractUrl || null,
      };

      // Se a senha foi preenchida na edição, gera novo hash. Caso contrário, ignora.
      if (data.password && data.password.trim() !== '') {
        dataToUpdate.password = await bcrypt.hash(data.password, 8);
      }

      const updated = await prisma.franchisee.update({
        where: { id },
        data: dataToUpdate
      });

      return res.json(updated);
    } catch (error) {
      console.error('[FRANQUEADO_UPDATE_ERROR]', error);
      return res.status(500).json({ error: 'Erro ao atualizar franqueado.' });
    }
  }

  // 4. Alternar Status (Ativo / Inativo)
  async toggleStatus(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const fran = await prisma.franchisee.findUnique({ where: { id } });
      
      if (!fran) return res.status(404).json({ error: 'Franqueado não encontrado.' });

      const updated = await prisma.franchisee.update({
        where: { id },
        data: { isActive: !fran.isActive }
      });

      return res.json(updated);
    } catch (error) {
      console.error('[FRANQUEADO_STATUS_ERROR]', error);
      return res.status(500).json({ error: 'Erro ao alterar status.' });
    }
  }
}