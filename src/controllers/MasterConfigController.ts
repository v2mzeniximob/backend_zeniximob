import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

// O "as any" evita bloqueios do TypeScript
const prisma = new PrismaClient() as any;

export class MasterConfigController {
  
  // Busca a configuração única do Master
  async get(req: Request, res: Response) {
    try {
      let config = await prisma.masterConfig.findFirst();
      if (!config) {
        config = await prisma.masterConfig.create({ data: {} });
      }
      
      // MASCARAR DADOS SENSÍVEIS (Não enviar os tokens reais para o frontend)
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

  // Atualiza as configurações
  async update(req: Request, res: Response) {
    try {
      const { mpAccessToken, mpPublicKey, templateMasterFranchisee, templateMasterRealEstate, templateFranchiseeRealEstate } = req.body;
      
      let config = await prisma.masterConfig.findFirst();
      
      const dataToUpdate: any = { 
        templateMasterFranchisee, 
        templateMasterRealEstate, 
        templateFranchiseeRealEstate 
      };

      // Só atualiza os tokens no banco se o usuário enviou um novo valor diferente da máscara "CONFIGURADO"
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

      // Mascara novamente para a resposta
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

  // ==========================================
  // GESTÃO DE USUÁRIOS MASTER
  // ==========================================
  async listAdmins(req: Request, res: Response) {
    try {
      // O "select" garante que a senha nunca seja pesquisada ou enviada
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
      
      // Retira a senha do retorno ao criar
      const { password: _, ...safeAdmin } = admin;
      return res.status(201).json(safeAdmin);
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

      // Retirar campos sensíveis (senha) antes de enviar a resposta
      const { password, ...safeAdmin } = admin;
      return res.json(safeAdmin);
      
    } catch (error) {
      return res.status(500).json({ error: 'Erro ao alterar status.' });
    }
  }
}