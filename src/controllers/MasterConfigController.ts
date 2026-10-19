import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient() as any;

export class MasterConfigController {
  
  // Busca a configuração única do Master (Mercado Pago, Templates e Landing Page JSON)
  async get(req: Request, res: Response) {
    try {
      let config = await prisma.masterConfig.findFirst();
      if (!config) {
        config = await prisma.masterConfig.create({ data: {} });
      }
      
      const safeConfig = {
        ...config,
        mpAccessToken: config.mpAccessToken ? 'CONFIGURADO' : '',
        mpPublicKey: config.mpPublicKey ? 'CONFIGURADO' : '',
      };

      return res.json(safeConfig);
    } catch (error) {
      return res.status(500).json({ error: 'Erro ao buscar configurações do Master.' });
    }
  }

  // Atualiza as configurações (Mercado Pago, Templates e landingPageJson)
  async update(req: Request, res: Response) {
    try {
      const { mpAccessToken, mpPublicKey, templateMasterFranchisee, templateMasterRealEstate, templateFranchiseeRealEstate, landingPageJson } = req.body;
      
      let config = await prisma.masterConfig.findFirst();
      
      const dataToUpdate: any = {};
      if (templateMasterFranchisee !== undefined) dataToUpdate.templateMasterFranchisee = templateMasterFranchisee;
      if (templateMasterRealEstate !== undefined) dataToUpdate.templateMasterRealEstate = templateMasterRealEstate;
      if (templateFranchiseeRealEstate !== undefined) dataToUpdate.templateFranchiseeRealEstate = templateFranchiseeRealEstate;
      if (landingPageJson !== undefined) dataToUpdate.landingPageJson = landingPageJson;

      if (mpAccessToken && mpAccessToken !== 'CONFIGURADO') {
        dataToUpdate.mpAccessToken = mpAccessToken;
      }
      if (mpPublicKey && mpPublicKey !== 'CONFIGURADO') {
        dataToUpdate.mpPublicKey = mpPublicKey;
      }

      if (config) {
        config = await prisma.masterConfig.update({
          where: { id: config.id },
          data: dataToUpdate
        });
      } else {
        config = await prisma.masterConfig.create({
          data: dataToUpdate
        });
      }

      const safeConfig = {
        ...config,
        mpAccessToken: config.mpAccessToken ? 'CONFIGURADO' : '',
        mpPublicKey: config.mpPublicKey ? 'CONFIGURADO' : '',
      };

      return res.json(safeConfig);
    } catch (error) {
      return res.status(500).json({ error: 'Erro ao salvar configurações.' });
    }
  }

  // Rota pública que entrega a configuração da Landing Page e os planos ativos para o site público
  async getLandingPagePublic(req: Request, res: Response) {
    try {
      let config = await prisma.masterConfig.findFirst();
      const plans = await prisma.plan.findMany({ 
        where: { isActive: true }, 
        orderBy: { price: 'asc' } 
      }).catch(() => []);

      return res.json({
        config: config?.landingPageJson || null,
        plans: plans || []
      });
    } catch (error) {
      return res.status(500).json({ error: 'Erro ao carregar dados da Landing Page.' });
    }
  }

  // Rota Master específica para atualizar o JSON da Landing Page
  async updateLandingPage(req: Request, res: Response) {
    try {
      const { config } = req.body;
      let masterConfig = await prisma.masterConfig.findFirst();

      if (masterConfig) {
        masterConfig = await prisma.masterConfig.update({
          where: { id: masterConfig.id },
          data: { landingPageJson: config }
        });
      } else {
        masterConfig = await prisma.masterConfig.create({
          data: { landingPageJson: config }
        });
      }

      return res.json({ message: 'Landing Page atualizada com sucesso!', config: masterConfig.landingPageJson });
    } catch (error) {
      return res.status(500).json({ error: 'Erro ao salvar a Landing Page.' });
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
      
      const { password: _, ...safeAdmin } = admin;
      return res.status(201).json(safeAdmin);
    } catch (error) {
      return res.status(500).json({ error: 'Erro ao criar administrador. Verifique se o e-mail já existe.' });
    }
  }

  // Atualizar dados de um admin Master (Nome, E-mail e Opcionalmente Nova Senha)
  async updateAdmin(req: Request, res: Response) {
    try {
      const id = req.params.id as string;
      const { name, email, password } = req.body;

      const dataToUpdate: any = {};
      if (name !== undefined) dataToUpdate.name = name;
      if (email !== undefined) dataToUpdate.email = email;
      if (password && password.trim() !== '') {
        dataToUpdate.password = password; // Se sua aplicação usa hash de senha, lembre-se de aplicar o hash aqui
      }

      const admin = await prisma.masterAdmin.update({
        where: { id },
        data: dataToUpdate
      });

      const { password: _, ...safeAdmin } = admin;
      return res.json(safeAdmin);
    } catch (error) {
      return res.status(500).json({ error: 'Erro ao atualizar administrador.' });
    }
  }

  async toggleAdminStatus(req: Request, res: Response) {
    try {
      const id = req.params.id as string;
      const { isActive } = req.body;
      
      const admin = await prisma.masterAdmin.update({
        where: { id: id },
        data: { isActive: Boolean(isActive) }
      });

      const { password, ...safeAdmin } = admin;
      return res.json(safeAdmin);
    } catch (error) {
      return res.status(500).json({ error: 'Erro ao alterar status.' });
    }
  }
}