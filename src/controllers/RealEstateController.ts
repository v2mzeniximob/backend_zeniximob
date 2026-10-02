import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export class RealEstateController {
  // ========================================================
  // ROTAS DA PRÓPRIA IMOBILIÁRIA (O Dono a editar a sua loja)
  // ========================================================
  
  async getMyStore(req: Request, res: Response) {
    try {
      const user = req.user as any;
      const realEstateId = user?.realEstateId || user?.id;
      
      if (!realEstateId) return res.status(403).json({ error: 'Acesso negado.' });

      const store = await (prisma as any).realEstate.findUnique({
        where: { id: realEstateId }
      });

      if (!store) return res.status(404).json({ error: 'Imobiliária não encontrada.' });

      return res.json(store);
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
        ownerContractTemplate, tenantContractTemplate,
        // NOVOS CAMPOS DO MERCADO PAGO:
        mpAccessToken, mpPublicKey
      } = req.body;

      const updatedStore = await (prisma as any).realEstate.update({
        where: { id: realEstateId },
        data: {
          tradeName, corporateName, cnpj, cep, address, phone, email,
          logoUrl, heroImageUrl, aboutText, footerText, instagramUrl, facebookUrl, whatsappDisplay,
          ownerContractTemplate, tenantContractTemplate,
          // Atualiza as credenciais financeiras no banco de dados
          mpAccessToken, mpPublicKey
        }
      });

      return res.json(updatedStore);
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
      const { corporateName, tradeName, cnpj, slug, email, phone, planId } = req.body;

      const storeExists = await (prisma as any).realEstate.findFirst({
        where: { OR: [{ cnpj }, { slug }, { email }] }
      });

      if (storeExists) {
        return res.status(400).json({ error: 'Imobiliária já existe (CNPJ, Slug ou E-mail duplicado).' });
      }

      const store = await (prisma as any).realEstate.create({
        data: { corporateName, tradeName, cnpj, slug, email, phone, planId }
      });

      return res.status(201).json(store);
    } catch (error) {
      return res.status(500).json({ error: 'Erro ao criar imobiliária.' });
    }
  }

  async list(req: Request, res: Response) {
    try {
      const stores = await (prisma as any).realEstate.findMany({
        orderBy: { createdAt: 'desc' },
        include: { plan: true }
      });
      return res.json(stores);
    } catch (error) {
      return res.status(500).json({ error: 'Erro ao listar imobiliárias.' });
    }
  }

  async update(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { corporateName, tradeName, cnpj, slug, email, phone, planId } = req.body;

      const store = await (prisma as any).realEstate.update({
        where: { id },
        data: { corporateName, tradeName, cnpj, slug, email, phone, planId }
      });

      return res.json(store);
    } catch (error) {
      return res.status(500).json({ error: 'Erro ao atualizar imobiliária.' });
    }
  }

  async toggleStatus(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const store = await (prisma as any).realEstate.findUnique({ where: { id } });
      
      if (!store) return res.status(404).json({ error: 'Imobiliária não encontrada.' });

      const updated = await (prisma as any).realEstate.update({
        where: { id },
        data: { isActive: !store.isActive }
      });

      return res.json(updated);
    } catch (error) {
      return res.status(500).json({ error: 'Erro ao alterar status.' });
    }
  }
}