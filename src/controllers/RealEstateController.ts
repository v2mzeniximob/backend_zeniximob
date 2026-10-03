import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

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

      // Remove dados sensíveis da resposta
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
        ownerContractTemplate, tenantContractTemplate,
        mpAccessToken, mpPublicKey
      } = req.body;

      const updatedStore = await (prisma as any).realEstate.update({
        where: { id: realEstateId },
        data: {
          tradeName, corporateName, cnpj, cep, address, phone, email,
          logoUrl, heroImageUrl, aboutText, footerText, instagramUrl, facebookUrl, whatsappDisplay,
          ownerContractTemplate, tenantContractTemplate,
          mpAccessToken: mpAccessToken || undefined, 
          mpPublicKey: mpPublicKey || undefined
        }
      });

      // 🔒 TRAVA DE SEGURANÇA: Remove dados sensíveis da resposta
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
      const { corporateName, tradeName, cnpj, slug, email, phone, planId } = req.body;

      const storeExists = await (prisma as any).realEstate.findFirst({
        where: { OR: [{ cnpj }, { slug }, { email }] }
      });

      if (storeExists) {
        return res.status(400).json({ error: 'Imobiliária já existe (CNPJ, Slug ou E-mail duplicado).' });
      }

      // Geração da senha padrão criptografada para o 1º acesso da imobiliária
      const hashedPassword = await bcrypt.hash('123456', 10);

      const store = await (prisma as any).realEstate.create({
        data: { 
          corporateName, 
          tradeName, 
          cnpj, 
          slug, 
          email, 
          phone, 
          planId,
          // PREENCHIMENTO AUTOMÁTICO DOS DADOS OBRIGATÓRIOS DO SCHEMA:
          stateRegistration: 'ISENTO',
          cityRegistration: 'ISENTO',
          cep: '00000-000',
          address: 'Endereço não informado',
          respName: 'Responsável',
          respCpf: '000.000.000-00',
          respPhone: phone || '0000000000',
          respAddress: 'Endereço não informado',
          password: hashedPassword // Senha padrão para o 1º acesso
        }
      });

      // 🔒 TRAVA DE SEGURANÇA: Remove dados sensíveis da resposta
      const { password, mpAccessToken, ...safeStore } = store;

      return res.status(201).json(safeStore);
    } catch (error) {
      console.error('[ERRO MASTER CREATE REALESTATE]', error);
      return res.status(500).json({ error: 'Erro ao criar imobiliária.' });
    }
  }

  async list(req: Request, res: Response) {
    try {
      const stores = await (prisma as any).realEstate.findMany({
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
      const { corporateName, tradeName, cnpj, slug, email, phone, planId } = req.body;

      const store = await (prisma as any).realEstate.update({
        where: { id },
        data: { corporateName, tradeName, cnpj, slug, email, phone, planId }
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
      const store = await (prisma as any).realEstate.findUnique({ where: { id } });
      
      if (!store) return res.status(404).json({ error: 'Imobiliária não encontrada.' });

      const updated = await (prisma as any).realEstate.update({
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