import { Router } from 'express';
import { AuthController } from '../controllers/AuthController';
import { PlanController } from '../controllers/PlanController';
import { FranchiseeController } from '../controllers/FranchiseeController';
import { IntegrationController } from '../controllers/IntegrationController';
import { RealEstateController } from '../controllers/RealEstateController';
import { DashboardController } from '../controllers/DashboardController';
import { PropertyController } from '../controllers/PropertyController';
import { authMiddleware, masterOnly } from '../middlewares/authMiddleware';

const routes = Router();
const authController = new AuthController();
const planController = new PlanController();
const franchiseeController = new FranchiseeController();
const integrationController = new IntegrationController();
const realEstateController = new RealEstateController();
const dashboardController = new DashboardController();
const propertyController = new PropertyController();

// ==========================================
// ROTAS PÚBLICAS
// ==========================================
routes.post('/login', authController.login);

// Vitrine Pública por Slug (Carrega dados da imobiliária, imóveis e corretores)
routes.get('/public/stores/:slug', propertyController.listPublicByStore);

// Envio de Lead Público (Quando o cliente clica em "Tenho Interesse" na vitrine)
routes.post('/public/leads', async (req, res) => {
  try {
    const { name, phone, email, interest, status, notes, propertyId, realEstateId, brokerId } = req.body;
    const { PrismaClient } = require('@prisma/client');
    const prisma = new PrismaClient();

    const lead = await prisma.lead.create({
      data: {
        name,
        phone,
        email,
        interest: interest || 'Geral',
        status: status || 'Novo',
        notes,
        propertyId: propertyId || null,
        brokerId: brokerId || null,
        realEstateId
      }
    });
    return res.status(201).json(lead);
  } catch (error) {
    return res.status(500).json({ error: 'Erro ao registar mensagem do cliente.' });
  }
});

// ==========================================
// ROTAS PROTEGIDAS (Qualquer usuário logado)
// ==========================================
routes.get('/integrations/cep/:cep', authMiddleware, integrationController.getCep);
routes.get('/integrations/cnpj/:cnpj', authMiddleware, integrationController.getCnpj);


// ==========================================
// ROTAS DE IMÓVEIS (Privadas para a Imobiliária / Corretores logados)
// ==========================================
routes.get('/properties', authMiddleware, propertyController.list);
routes.post('/properties', authMiddleware, propertyController.create);
routes.put('/properties/:id', authMiddleware, propertyController.update);
routes.patch('/properties/:id/status', authMiddleware, propertyController.toggleStatus);

// ==========================================
// ROTAS DE LEADS (Privadas para a Imobiliária)
// ==========================================
routes.get('/leads', authMiddleware, async (req: any, res) => {
  try {
    const { PrismaClient } = require('@prisma/client');
    const prisma = new PrismaClient();
    const realEstateId = req.realEstateId || req.user?.realEstateId;

    const leads = await prisma.lead.findMany({
      where: { realEstateId },
      include: { property: true },
      orderBy: { createdAt: 'desc' }
    });
    return res.json(leads);
  } catch (error) {
    return res.status(500).json({ error: 'Erro ao buscar leads.' });
  }
});

routes.post('/leads', authMiddleware, async (req: any, res) => {
  try {
    const { name, phone, email, interest, status, propertyId, notes } = req.body;
    const { PrismaClient } = require('@prisma/client');
    const prisma = new PrismaClient();
    const realEstateId = req.realEstateId || req.user?.realEstateId;

    const lead = await prisma.lead.create({
      data: {
        name, phone, email, interest, status: status || 'Novo', notes,
        propertyId: propertyId || null,
        realEstateId
      }
    });
    return res.status(201).json(lead);
  } catch (error) {
    return res.status(500).json({ error: 'Erro ao criar lead.' });
  }
});

routes.put('/leads/:id', authMiddleware, async (req: any, res) => {
  try {
    const { id } = req.params;
    const { name, phone, email, interest, status, propertyId, notes } = req.body;
    const { PrismaClient } = require('@prisma/client');
    const prisma = new PrismaClient();
    const realEstateId = req.realEstateId || req.user?.realEstateId;

    const lead = await prisma.lead.update({
      where: { id, realEstateId },
      data: { name, phone, email, interest, status, propertyId: propertyId || null, notes }
    });
    return res.json(lead);
  } catch (error) {
    return res.status(500).json({ error: 'Erro ao atualizar lead.' });
  }
});


// ==========================================
// ROTAS RESTRITAS (Apenas MASTER)
// ==========================================
routes.use('/plans', authMiddleware, masterOnly); 
routes.post('/plans', planController.create);
routes.get('/plans', planController.list);
routes.put('/plans/:id', planController.update);
routes.patch('/plans/:id/status', planController.toggleStatus);

// Rotas de Franqueados
routes.use('/franchisees', authMiddleware, masterOnly);
routes.post('/franchisees', franchiseeController.create);
routes.get('/franchisees', franchiseeController.list);
routes.put('/franchisees/:id', franchiseeController.update);
routes.patch('/franchisees/:id/status', franchiseeController.toggleStatus);

// ==========================================
// ROTAS DE IMOBILIÁRIAS (MASTER)
// ==========================================
routes.use('/real-estates', authMiddleware, masterOnly);
routes.post('/real-estates', realEstateController.create);
routes.get('/real-estates', realEstateController.list);
routes.put('/real-estates/:id', realEstateController.update);
routes.patch('/real-estates/:id/status', realEstateController.toggleStatus);

// ==========================================
// ROTAS DE DASHBOARD / B.I
// ==========================================
routes.get('/dashboard/master', authMiddleware, masterOnly, dashboardController.getMasterStats);

export default routes;