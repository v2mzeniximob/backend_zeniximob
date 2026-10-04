import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import process from 'process';

const prisma = new PrismaClient() as any;
const secret = process.env.JWT_SECRET || 'zeniximob_super_secret_key_2024';

export class ClientPortalController {

 // ==========================================
  // 1. FAZER LOGIN NO PORTAL  LÊ O SLUG
  // ==========================================
  async login(req: Request, res: Response) {
    try {
      const { document, password, role } = req.body;
      const slug = req.headers['x-store-slug'] as string; // <--- Lê a imobiliária vinda do Frontend!

      if (!document || !password || !role) {
        return res.status(400).json({ error: 'Credenciais incompletas.' });
      }

      // Remove os pontos e traços do documento
      const cleanDocument = document.replace(/\D/g, '');

      // 1. Se o slug foi enviado, precisamos descobrir qual é o ID desta imobiliária
      let realEstateId = null;
      if (slug) {
        const store = await prisma.realEstate.findUnique({ where: { slug } });
        if (store) {
          realEstateId = store.id;
        } else {
          return res.status(404).json({ error: 'Imobiliária não encontrada no sistema.' });
        }
      }

      let userFound: any = null;

      // 2. Prepara a busca. Se tivermos o realEstateId, procura SÓ nessa imobiliária.
      if (role === 'CLIENT') {
        const query: any = { document: cleanDocument };
        if (realEstateId) query.realEstateId = realEstateId;
        
        userFound = await prisma.client.findFirst({ where: query });
      } else if (role === 'OWNER') {
        const query: any = { cpfOrCnpj: cleanDocument };
        if (realEstateId) query.realEstateId = realEstateId;

        userFound = await prisma.owner.findFirst({ where: query });
      }

      if (!userFound) {
        return res.status(404).json({ error: 'Usuário não encontrado nesta imobiliária.' });
      }

      if (!userFound.password) {
        return res.status(401).json({ error: 'Acesso não liberado. Solicite a sua senha à imobiliária.' });
      }

      // 3. Verifica a Senha
      const isValidPassword = await bcrypt.compare(password, userFound.password);
      if (!isValidPassword) {
        return res.status(401).json({ error: 'Senha incorreta.' });
      }

      // 4. GERA O TOKEN (já com a imobiliária e o papel corretos)
      const token = jwt.sign(
        { 
          id: userFound.id, 
          role: role, 
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

  // Rota antiga mantida
  async createAccess(req: Request, res: Response) {
     return res.json({ message: "Acesso agora é gerido no cadastro do cliente/proprietário." });
  }
}