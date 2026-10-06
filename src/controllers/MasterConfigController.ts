import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

// O "as any" evita que o TypeScript bloqueie o código antes de os tipos do Prisma serem atualizados
const prisma = new PrismaClient() as any;

export class MasterConfigController {
  
  // Busca a configuração única do Master (Cria uma vazia se não existir)
  async get(req: Request, res: Response) {
    try {
      let config = await prisma.masterConfig.findFirst();
      if (!config) {
        config = await prisma.masterConfig.create({ data: {} });
      }
      return res.json(config);
    } catch (error) {
      return res.status(500).json({ error: 'Erro ao buscar configurações do Master.' });
    }
  }

  // Atualiza as chaves do Mercado Pago e os Templates HTML
  async update(req: Request, res: Response) {
    try {
      const { mpAccessToken, mpPublicKey, templateMasterFranchisee, templateMasterRealEstate, templateFranchiseeRealEstate } = req.body;
      
      let config = await prisma.masterConfig.findFirst();
      
      if (config) {
        config = await prisma.masterConfig.update({
          where: { id: config.id },
          data: { mpAccessToken, mpPublicKey, templateMasterFranchisee, templateMasterRealEstate, templateFranchiseeRealEstate }
        });
      } else {
        config = await prisma.masterConfig.create({
          data: { mpAccessToken, mpPublicKey, templateMasterFranchisee, templateMasterRealEstate, templateFranchiseeRealEstate }
        });
      }

      return res.json(config);
    } catch (error) {
      return res.status(500).json({ error: 'Erro ao salvar configurações.' });
    }
  }

  // ==========================================
  // GESTÃO DE USUÁRIOS MASTER
  // ==========================================
  async listAdmins(req: Request, res: Response) {
    try {
      const admins = await prisma.masterAdmin.findMany({
        select: { id: true, name: true, email: true, isActive: true, createdAt: true }
      });
      return res.json(admins);
    } catch (error) {
      return res.status(500).json({ error: 'Erro ao listar administradores.' });
    }
  }

  async createAdmin(req: Request, res: Response) {
    try {
      const { name, email, password } = req.body;
      const admin = await prisma.masterAdmin.create({
        data: { name, email, password } 
      });
      return res.status(201).json(admin);
    } catch (error) {
      return res.status(500).json({ error: 'Erro ao criar administrador. Verifique se o e-mail já existe.' });
    }
  }

  async toggleAdminStatus(req: Request, res: Response) {
    try {
      // Forçamos o TypeScript a entender que isto é uma string
      const id = req.params.id as string;
      const { isActive } = req.body;
      
      const admin = await prisma.masterAdmin.update({
        where: { id: id },
        data: { isActive: Boolean(isActive) }
      });
      return res.json(admin);
    } catch (error) {
      return res.status(500).json({ error: 'Erro ao alterar status.' });
    }
  }
}