import { Router } from 'express';
import { AuthController } from '../controllers/AuthController';
import { PlanController } from '../controllers/PlanController';
import { authMiddleware, masterOnly } from '../middlewares/authMiddleware';

const routes = Router();
const authController = new AuthController();
const planController = new PlanController();

// ==========================================
// ROTAS PÚBLICAS (Login)
// ==========================================
routes.post('/login', authController.login);

// ==========================================
// ROTAS RESTRITAS (Apenas MASTER)
// ==========================================
// Todas as rotas dentro deste bloco vão passar pelos 2 "seguranças" (authMiddleware e masterOnly)
routes.use('/plans', authMiddleware, masterOnly); 

routes.post('/plans', planController.create);         
routes.get('/plans', planController.list);             
routes.put('/plans/:id', planController.update);       
routes.patch('/plans/:id/status', planController.toggleStatus); 

export default routes;