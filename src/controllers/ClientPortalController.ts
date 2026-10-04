import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import process from 'process';

const prisma = new PrismaClient() as any;
const secret = process.env.JWT_SECRET || 'zeniximob_super_secret_key_2024';

export class ClientPortalController {

  // ==========================================
  // 1. FAZER LOGIN NO PORTAL
  // ==========================================
  async login(req: Request, res: Response) {
    try {
      const { document, password, role } = req.body;

      if (!document || !password || !role) {
        return res.status(400).json({ error: 'Credenciais incompletas.' });
      }

      let userFound: any = null;

      // Procura na tabela correta dependendo de quem está tentando logar
      if (role === 'CLIENT') {
        userFound = await prisma.client.findUnique({ where: { document } });
      } else if (role === 'OWNER') {
        userFound = await prisma.owner.findFirst({ where: { cpfOrCnpj: document } });
      }

      if (!userFound) {
        return res.status(404).json({ error: 'Usuário não encontrado com este documento.' });
      }

      if (!userFound.password) {
        return res.status(401).json({ error: 'Acesso não liberado. Solicite a sua senha à imobiliária.' });
      }

      // Verifica se a senha bate com a encriptação (Bcrypt)
      const isValidPassword = await bcrypt.compare(password, userFound.password);
      if (!isValidPassword) {
        return res.status(401).json({ error: 'Senha incorreta.' });
      }

      // GERA O TOKEN COM A ROLE EXATA ('CLIENT' ou 'OWNER') PARA PASSAR NO MIDDLEWARE!
      const token = jwt.sign(
        { 
          id: userFound.id, 
          role: role, // Aqui está o segredo que vai resolver o erro 403!
          realEstateId: userFound.realEstateId 
        }, 
        secret, 
        { expiresIn: '7d' }
      );

      return res.json({
        token,
        user: {
          id: userFound.id,
          name: userFound.name || userFound.corporateName,
          role: role
        }
      });
    } catch (error) {
      console.error('Erro no login do portal:', error);
      return res.status(500).json({ error: 'Erro interno ao realizar login.' });
    }
  }

  // ==========================================
  // 2. BUSCAR DADOS DO DASHBOARD 
  // ==========================================
  async getDashboard(req: Request, res: Response) {
    try {
      const user = req.user as any;
      if (!user) return res.status(401).json({ error: 'Não autorizado.' });

      // ----------------------------------------------------
      // VISÃO DO INQUILINO (CLIENT)
      // ----------------------------------------------------
      if (user.role === 'CLIENT') {
        const contractsRaw = await prisma.contract.findMany({
          where: { tenantId: user.id, status: 'Ativo' },
          include: {
            property: { select: { title: true, address: true, imageUrls: true } },
            invoices: { orderBy: { dueDate: 'desc' } }
          }
        });

        // Prepara a imagem de capa para o frontend não quebrar
        const contracts = contractsRaw.map((c: any) => ({
          ...c,
          property: {
            ...c.property,
            coverImage: c.property.imageUrls && c.property.imageUrls.length > 0 ? c.property.imageUrls[0] : null
          }
        }));

        const tickets = await prisma.ticket.findMany({
          where: { clientId: user.id },
          include: { property: { select: { title: true } } },
          orderBy: { createdAt: 'desc' }
        });

        return res.json({ contracts, tickets });
      }

      // ----------------------------------------------------
      // VISÃO DO PROPRIETÁRIO (OWNER)
      // ----------------------------------------------------
      if (user.role === 'OWNER') {
        const properties = await prisma.property.findMany({
          where: { ownerId: user.id },
          include: {
            contracts: {
              where: { status: 'Ativo' },
              include: {
                invoices: { orderBy: { dueDate: 'desc' } }
              }
            }
          },
          orderBy: { createdAt: 'desc' }
        });

        return res.json({ properties });
      }

      return res.status(403).json({ error: 'Perfil não reconhecido.' });
    } catch (error) {
      console.error('Erro ao buscar dashboard:', error);
      return res.status(500).json({ error: 'Erro ao carregar os dados do painel.' });
    }
  }

  // Rota antiga para evitar erros de rotas que já estavam declaradas
  async createAccess(req: Request, res: Response) {
     return res.json({ message: "Acesso agora é gerido no cadastro do cliente/proprietário." });
  }
}