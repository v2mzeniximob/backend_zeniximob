import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import process from 'process';

const prisma = new PrismaClient();

export class AuthController {
  async login(req: Request, res: Response): Promise<any> {
    try {
      const { email, password } = req.body;

      if (!email || !password) {
        return res.status(400).json({ error: 'E-mail e senha são obrigatórios' });
      }

      // 1. Tentar encontrar o usuário no nível MasterAdmin
      const masterUser = await prisma.masterAdmin.findUnique({ where: { email } });

      if (!masterUser) {
        // Futuramente, adicionaremos aqui a busca nas tabelas de Franchisee e RealEstate
        return res.status(401).json({ error: 'Credenciais inválidas' });
      }

      // 2. Verificar se o usuário está ativo
      if (!masterUser.isActive) {
        return res.status(401).json({ error: 'Usuário inativo' });
      }

      // 3. Comparar a senha enviada com a senha criptografada no banco
      const isValidPassword = await bcrypt.compare(password, masterUser.password);
      if (!isValidPassword) {
        return res.status(401).json({ error: 'Credenciais inválidas' });
      }

      // 4. Gerar o Token JWT
      const secret = process.env.JWT_SECRET || 'zeniximob_super_secret_key_2024';
      const token = jwt.sign(
        { 
          id: masterUser.id, 
          email: masterUser.email, 
          role: 'MASTER' // Isso vai ser crucial para travar o painel depois
        },
        secret,
        { expiresIn: '1d' } // Token expira em 1 dia
      );

      // 5. Retornar os dados (sem a senha, obviamente) e o token
      return res.json({
        user: {
          id: masterUser.id,
          name: masterUser.name,
          email: masterUser.email,
          role: 'MASTER'
        },
        token
      });

    } catch (error) {
      console.error('Erro no login:', error);
      return res.status(500).json({ error: 'Erro interno no servidor' });
    }
  }
}