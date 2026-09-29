import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';


const prisma = new PrismaClient() as any;

// Função auxiliar para gerar URLs amigáveis (slug)
function generateSlug(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-');
}

export class RealEstateController {
  // Criar Imobiliária
  async create(req: Request, res: Response) {
    try {
      const {
        cnpj,
        corporateName,
        tradeName,
        stateRegistration,
        cityRegistration,
        cep,
        address,
        phone,
        respName,
        respCpf,
        respPhone,
        respAddress,
        email,
        password,
        contractUrl,
        planId,
        franchiseeId
      } = req.body;

      if (!cnpj || !corporateName || !tradeName || !email || !password || !planId) {
        return res.status(400).json({ error: 'Preencha todos os campos obrigatórios, incluindo o plano.' });
      }

      // Verifica se já existe email ou cnpj cadastrado
      const existing = await prisma.realEstate.findFirst({
        where: { OR: [{ email }, { cnpj }] }
      });

      if (existing) {
        return res.status(400).json({ error: 'Já existe uma imobiliária com este E-mail ou CNPJ.' });
      }

      const hashedPassword = await bcrypt.hash(password, 8);
      const baseSlug = generateSlug(tradeName);

      // Garante unicidade do slug se já houver outro idêntico
      const existingSlug = await prisma.realEstate.findUnique({ where: { slug: baseSlug } });
      const slug = existingSlug ? `${baseSlug}-${Date.now().toString().slice(-4)}` : baseSlug;

      const realEstate = await prisma.realEstate.create({
        data: {
          cnpj,
          corporateName,
          tradeName,
          slug,
          stateRegistration: stateRegistration || 'ISENTO',
          cityRegistration: cityRegistration || 'ISENTO',
          cep,
          address,
          phone,
          respName,
          respCpf,
          respPhone,
          respAddress,
          email,
          password: hashedPassword,
          contractUrl: contractUrl || null,
          planId,
          franchiseeId: franchiseeId || null
        },
        include: { plan: true, franchisee: true }
      });

      return res.status(201).json(realEstate);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro interno ao criar imobiliária.' });
    }
  }

  // Listar Imobiliárias
  async list(req: Request, res: Response) {
    try {
      const realEstates = await prisma.realEstate.findMany({
        include: { plan: true, franchisee: true },
        orderBy: { createdAt: 'desc' }
      });
      return res.json(realEstates);
    } catch (error) {
      return res.status(500).json({ error: 'Erro ao listar imobiliárias.' });
    }
  }

  // Atualizar Imobiliária
  async update(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const {
        cnpj,
        corporateName,
        tradeName,
        stateRegistration,
        cityRegistration,
        cep,
        address,
        phone,
        respName,
        respCpf,
        respPhone,
        respAddress,
        email,
        password,
        contractUrl,
        planId,
        franchiseeId
      } = req.body;

      const dataToUpdate: any = {
        cnpj,
        corporateName,
        tradeName,
        stateRegistration: stateRegistration || 'ISENTO',
        cityRegistration: cityRegistration || 'ISENTO',
        cep,
        address,
        phone,
        respName,
        respCpf,
        respPhone,
        respAddress,
        email,
        contractUrl: contractUrl || null,
        planId,
        franchiseeId: franchiseeId || null
      };

      // Se alterou o nome fantasia, atualiza o slug da loja
      if (tradeName) {
        const baseSlug = generateSlug(tradeName);
        const existingSlug = await prisma.realEstate.findFirst({
          where: { slug: baseSlug, NOT: { id } }
        });
        dataToUpdate.slug = existingSlug ? `${baseSlug}-${Date.now().toString().slice(-4)}` : baseSlug;
      }

      // Se preencheu nova senha, faz o hash
      if (password && password.trim() !== '') {
        dataToUpdate.password = await bcrypt.hash(password, 8);
      }

      const updated = await prisma.realEstate.update({
        where: { id },
        data: dataToUpdate,
        include: { plan: true, franchisee: true }
      });

      return res.json(updated);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao atualizar imobiliária.' });
    }
  }

  // Alternar Status (Ativo / Inativo)
  async toggleStatus(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const store = await prisma.realEstate.findUnique({ where: { id } });
      if (!store) return res.status(404).json({ error: 'Imobiliária não encontrada.' });

      const updated = await prisma.realEstate.update({
        where: { id },
        data: { isActive: !store.isActive }
      });

      return res.json(updated);
    } catch (error) {
      return res.status(500).json({ error: 'Erro ao alterar status da imobiliária.' });
    }
  }
}