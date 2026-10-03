import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient() as any;

export class RealEstateController {
  // ========================================================
  // ROTAS DA PRÓPRIA IMOBILIÁRIA (O Dono a editar a sua loja)
  // ========================================================
  
  async getMyStore(req: Request, res: Response) {
    try {
      const user = req.user as any;
      const realEstateId = user?.realEstateId || user?.id;
      
      if (!realEstateId) return res.status(403).json({ error: 'Acesso negado.' });

      const store = await prisma.realEstate.findUnique({
        where: { id: realEstateId }
      });

      if (!store) return res.status(404).json({ error: 'Imobiliária não encontrada.' });

      const { password, mpAccessToken, ...safeStore } = store;
      return res.json(safeStore);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao buscar dados da imobiliária.' });
    }
  }

  async updateMyStore(req: Request, res: Response) {
    try {
      const user = req.user as any;
      const realEstateId = user?.realEstateId || user?.id;
      
      if (!realEstateId) return res.status(403).json({ error: 'Acesso negado.' });

      const { 
        tradeName, corporateName, cnpj, cep, address, phone, email,
        logoUrl, heroImageUrl, aboutText, footerText, instagramUrl, facebookUrl, whatsappDisplay,
        ownerContractTemplate, tenantContractTemplate, financingTemplate, // <--- ADICIONADO AQUI
        mpAccessToken, mpPublicKey
      } = req.body;

      const updatedStore = await prisma.realEstate.update({
        where: { id: realEstateId },
        data: {
          tradeName, corporateName, cnpj, cep, address, phone, email,
          logoUrl, heroImageUrl, aboutText, footerText, instagramUrl, facebookUrl, whatsappDisplay,
          ownerContractTemplate, tenantContractTemplate, financingTemplate, // <--- ADICIONADO AQUI
          mpAccessToken: mpAccessToken || undefined, 
          mpPublicKey: mpPublicKey || undefined
        }
      });

      const { password, mpAccessToken: hiddenToken, ...safeStore } = updatedStore;
      return res.json(safeStore);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao atualizar configurações da loja.' });
    }
  }

  // ========================================================
  // ROTAS MASTER (Administrador Master a gerir imobiliárias)
  // ========================================================
  
  async create(req: Request, res: Response) {
    try {
      const { 
        corporateName, tradeName, cnpj, slug, email, phone, planId, franchiseeId,
        stateRegistration, cityRegistration, cep, address, 
        respName, respCpf, respPhone, respAddress 
      } = req.body;

      let finalSlug = slug;
      if (!finalSlug && tradeName) {
         finalSlug = tradeName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');
      }

      let finalPlanId = planId;
      if (!finalPlanId) {
         const defaultPlan = await prisma.plan.findFirst();
         if (!defaultPlan) {
            return res.status(400).json({ error: 'Nenhum plano encontrado no sistema. Por favor, crie um plano primeiro ou rode o Seed.' });
         }
         finalPlanId = defaultPlan.id;
      }

      const storeExists = await prisma.realEstate.findFirst({
        where: { OR: [{ cnpj }, { slug: finalSlug }, { email }] }
      });

      if (storeExists) {
        return res.status(400).json({ error: 'Imobiliária já existe (CNPJ, Slug ou E-mail duplicado).' });
      }

      const hashedPassword = await bcrypt.hash('123456', 10);

      const store = await prisma.realEstate.create({
        data: { 
          corporateName, tradeName, cnpj, slug: finalSlug, email, phone, planId: finalPlanId,
          franchiseeId: franchiseeId || null,
          stateRegistration: stateRegistration || 'ISENTO',
          cityRegistration: cityRegistration || 'ISENTO',
          cep: cep || '00000-000', address: address || 'Endereço não informado',
          respName: respName || 'Responsável', respCpf: respCpf || '000.000.000-00',
          respPhone: respPhone || phone || '0000000000', respAddress: respAddress || 'Endereço não informado',
          password: hashedPassword
        }
      });

      const { password, mpAccessToken, ...safeStore } = store;
      return res.status(201).json(safeStore);
      
    } catch (error: any) {
      console.error('[ERRO MASTER CREATE REALESTATE]', error);
      return res.status(500).json({ 
        error: 'Erro interno ao criar imobiliária no banco de dados.',
        detail: error.message || String(error) 
      });
    }
  }

  async list(req: Request, res: Response) {
    try {
      const stores = await prisma.realEstate.findMany({
        orderBy: { createdAt: 'desc' },
        include: { plan: true }
      });

      const safeStores = stores.map((store: any) => {
        const { password, mpAccessToken, ...safeStore } = store;
        return safeStore;
      });

      return res.json(safeStores);
    } catch (error) {
      return res.status(500).json({ error: 'Erro ao listar imobiliárias.' });
    }
  }

  async update(req: Request, res: Response) {
    try {
      const { id } = req.params;
      
      const { 
        corporateName, tradeName, cnpj, slug, email, phone, planId, franchiseeId,
        stateRegistration, cityRegistration, cep, address, 
        respName, respCpf, respPhone, respAddress 
      } = req.body;

      const store = await prisma.realEstate.update({
        where: { id },
        data: { 
          corporateName, tradeName, cnpj, slug, email, phone, planId, franchiseeId,
          stateRegistration, cityRegistration, cep, address, 
          respName, respCpf, respPhone, respAddress 
        }
      });

      const { password, mpAccessToken, ...safeStore } = store;
      return res.json(safeStore);
    } catch (error) {
      return res.status(500).json({ error: 'Erro ao atualizar imobiliária.' });
    }
  }

  async toggleStatus(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const store = await prisma.realEstate.findUnique({ where: { id } });
      
      if (!store) return res.status(404).json({ error: 'Imobiliária não encontrada.' });

      const updated = await prisma.realEstate.update({
        where: { id },
        data: { isActive: !store.isActive }
      });

      const { password, mpAccessToken, ...safeStore } = updated;
      return res.json(safeStore);
    } catch (error) {
      return res.status(500).json({ error: 'Erro ao alterar status.' });
    }
  }
}