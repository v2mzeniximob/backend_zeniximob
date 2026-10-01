import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

const prisma = new PrismaClient() as any;

export class AuthController {
  async login(req: Request, res: Response) {
    try {
      const { email, password } = req.body;
      console.log(`[LOGIN] Tentativa de acesso para o e-mail: ${email}`);

      if (!email || !password) {
        return res.status(400).json({ error: 'E-mail e senha são obrigatórios.' });
      }

      // 1. Verificar se é o utilizador MASTER
      const masterEmail = process.env.MASTER_EMAIL;
      const masterPassword = process.env.MASTER_PASSWORD;

      if (email === masterEmail) {
        if (password === masterPassword) {
          console.log('[LOGIN] Acesso Master autorizado.');
          const token = jwt.sign(
            { id: 'master-id', email: masterEmail, role: 'MASTER', isMaster: true },
            process.env.JWT_SECRET || 'zeniximob-secret',
            { expiresIn: '7d' }
          );
          return res.json({
            token,
            user: { id: 'master-id', email: masterEmail, role: 'MASTER', isMaster: true }
          });
        } else {
          console.log('[LOGIN] Senha Master incorreta.');
          return res.status(401).json({ error: 'Credenciais inválidas.' });
        }
      }

      // 2. Verificar na tabela de Imobiliárias (RealEstate)
      const realEstate = await prisma.realEstate.findUnique({ where: { email } });
      if (realEstate) {
        console.log('[LOGIN] Imobiliária encontrada:', realEstate.tradeName);
        
        if (!realEstate.isActive) {
          return res.status(401).json({ error: 'Esta imobiliária encontra-se inativa.' });
        }

        const passwordMatch = await bcrypt.compare(password, realEstate.password);
        if (!passwordMatch) {
          console.log('[LOGIN] Senha incorreta para a imobiliária.');
          return res.status(401).json({ error: 'Credenciais inválidas.' });
        }

        const token = jwt.sign(
          { id: realEstate.id, email: realEstate.email, realEstateId: realEstate.id, role: 'REAL_ESTATE' },
          process.env.JWT_SECRET || 'zeniximob-secret',
          { expiresIn: '7d' }
        );
        return res.json({
          token,
          user: { 
            id: realEstate.id, 
            name: realEstate.tradeName, 
            email: realEstate.email, 
            role: 'REAL_ESTATE', 
            realEstateId: realEstate.id 
          }
        });
      }

      // 3. Verificar na tabela de Corretores (Broker)
      const broker = await prisma.broker.findUnique({ where: { email } });
      if (broker) {
        console.log('[LOGIN] Corretor encontrado:', broker.name);

        if (!broker.isActive) {
          return res.status(401).json({ error: 'Este corretor encontra-se inativo.' });
        }

        const passwordMatch = await bcrypt.compare(password, broker.password);
        if (!passwordMatch) {
          return res.status(401).json({ error: 'Credenciais inválidas.' });
        }

        const token = jwt.sign(
          { id: broker.id, email: broker.email, realEstateId: broker.realEstateId, role: 'BROKER' },
          process.env.JWT_SECRET || 'zeniximob-secret',
          { expiresIn: '7d' }
        );
        return res.json({
          token,
          user: { 
            id: broker.id, 
            name: broker.name, 
            email: broker.email, 
            role: 'BROKER', 
            realEstateId: broker.realEstateId 
          }
        });
      }

      console.log('[LOGIN] E-mail não encontrado em nenhuma tabela.');
      return res.status(401).json({ error: 'Credenciais inválidas.' });
    } catch (error) {
      console.error('[LOGIN_ERROR] Erro interno:', error);
      return res.status(500).json({ error: 'Erro interno no servidor ao realizar login.' });
    }
  }
}