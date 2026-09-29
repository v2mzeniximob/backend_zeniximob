import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import process from 'process';

interface TokenPayload {
  id: string;
  email: string;
  role: string;
  iat: number;
  exp: number;
}

// Estendemos a tipagem do Express para que o 'req' passe a enxergar o 'user' logado
declare global {
  namespace Express {
    interface Request {
      user?: TokenPayload;
    }
  }
}

// Middleware 1: Verifica se a pessoa tem o Token (Está logada?)
export function authMiddleware(req: Request, res: Response, next: NextFunction): any {
  const { authorization } = req.headers;

  if (!authorization) {
    return res.status(401).json({ error: 'Token não fornecido' });
  }

  const [, token] = authorization.split(' '); // Separa a palavra "Bearer" do Token

  try {
    const secret = process.env.JWT_SECRET || 'zeniximob_super_secret_key_2024';
    const decoded = jwt.verify(token, secret) as TokenPayload;

    req.user = decoded; // Injeta os dados do usuário na requisição atual
    return next(); // Libera a passagem para a rota
  } catch (error) {
    return res.status(401).json({ error: 'Token inválido ou expirado' });
  }
}

// Middleware 2: Verifica se o nível de acesso é do dono (MASTER)
export function masterOnly(req: Request, res: Response, next: NextFunction): any {
  if (req.user?.role !== 'MASTER') {
    return res.status(403).json({ error: 'Acesso negado. Funcionalidade exclusiva do MASTER.' });
  }
  return next(); // Se for Master, libera!
}