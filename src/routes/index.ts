import { Router } from 'express';
import { AuthController } from '../controllers/AuthController';
import { authMiddleware, masterOnly } from '../middlewares/authMiddleware';

const routes = Router();
const authController = new AuthController();

// ------------------------------------
// ROTAS PÚBLICAS (Qualquer um acessa)
// ------------------------------------
routes.post('/login', authController.login);


// ------------------------------------
// ROTAS PROTEGIDAS (Precisa estar logado)
// ------------------------------------
routes.get('/me', authMiddleware, (req, res) => {
  return res.json({ message: 'Você está autenticado!', user: req.user });
});


// ------------------------------------
// ROTAS RESTRITAS (Apenas MASTER)
// ------------------------------------
routes.get('/master-only', authMiddleware, masterOnly, (req, res) => {
  return res.json({ message: 'Bem-vindo à área de relatórios VIP do Master!' });
});

export default routes;