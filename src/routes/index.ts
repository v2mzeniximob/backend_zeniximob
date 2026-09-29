import { Router } from 'express';
import { AuthController } from '../controllers/AuthController';
import { PlanController } from '../controllers/PlanController';
import { FranchiseeController } from '../controllers/FranchiseeController';
import { IntegrationController } from '../controllers/IntegrationController';
import { authMiddleware, masterOnly } from '../middlewares/authMiddleware';
import { RealEstateController } from '../controllers/RealEstateController';

const routes = Router();
const authController = new AuthController();
const planController = new PlanController();
const franchiseeController = new FranchiseeController();
const integrationController = new IntegrationController();
const realEstateController = new RealEstateController();

// ==========================================
// ROTAS PÚBLICAS
// ==========================================
routes.post('/login', authController.login);

// ==========================================
// ROTAS PROTEGIDAS (Qualquer usuário logado)
// ==========================================
// O Frontend vai usar essas rotas para preencher formulários sozinhos
routes.get('/integrations/cep/:cep', authMiddleware, integrationController.getCep);
routes.get('/integrations/cnpj/:cnpj', authMiddleware, integrationController.getCnpj);


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

export default routes;