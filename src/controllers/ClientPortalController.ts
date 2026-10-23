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
      const slug = req.headers['x-store-slug'] as string; 

      if (!document || !password || !role) {
        return res.status(400).json({ error: 'Credenciais incompletas.' });
      }

      const cleanDocument = document.replace(/\D/g, '');

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

      const isValidPassword = await bcrypt.compare(password, userFound.password);
      if (!isValidPassword) {
        return res.status(401).json({ error: 'Senha incorreta.' });
      }

      const token = jwt.sign(
        { id: userFound.id, role: role, realEstateId: userFound.realEstateId }, 
        secret, 
        { expiresIn: '7d' }
      );

      return res.json({
        token,
        user: { id: userFound.id, name: userFound.name || userFound.corporateName, role: role }
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

        const contracts = contractsRaw.map((c: any) => ({
          ...c,
          property: {
            ...c.property,
            coverImage: c.property.imageUrls && c.property.imageUrls.length > 0 ? c.property.imageUrls[0] : null
          }
        }));

        // Busca boletos de condomínio vinculados a este cliente (unidade)
        const condoBills = await prisma.condoBill.findMany({
          where: { unit: { clientId: user.id } },
          include: { condominium: { select: { name: true, address: true } }, unit: true },
          orderBy: { dueDate: 'asc' }
        });

        const tickets = await prisma.ticket.findMany({
          where: { clientId: user.id },
          include: { 
            property: { select: { title: true } },
            messages: { orderBy: { createdAt: 'asc' } }
          },
          orderBy: { createdAt: 'desc' }
        });

        const condoUnit = await prisma.condoUnit.findFirst({
          where: user.role === 'CLIENT' ? { clientId: user.id } : { ownerId: user.id }
        });

        let condoReservations = [];
        let condoAssemblies = [];

        if (condoUnit) {
          condoReservations = await prisma.condoReservation.findMany({
            where: { condominiumId: condoUnit.condominiumId },
            orderBy: { reservationDate: 'asc' }
          });
          condoAssemblies = await prisma.condoAssembly.findMany({
            where: { condominiumId: condoUnit.condominiumId },
            orderBy: { assemblyDate: 'desc' }
          });
        }

        return res.json({ contracts, condoBills, tickets });
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
              include: { invoices: { orderBy: { dueDate: 'desc' } } }
            }
          },
          orderBy: { createdAt: 'desc' }
        });

        // Busca boletos de condomínio das unidades que pertencem a este proprietário
        const condoBills = await prisma.condoBill.findMany({
          where: { unit: { ownerId: user.id } },
          include: { condominium: { select: { name: true, address: true } }, unit: true },
          orderBy: { dueDate: 'asc' }
        });

        const tickets = await prisma.ticket.findMany({
          where: { 
            property: { ownerId: user.id },
            clientId: null 
          },
          include: { 
            property: { select: { title: true } },
            messages: { orderBy: { createdAt: 'asc' } }
          },
          orderBy: { createdAt: 'desc' }
        });

        return res.json({ properties, condoBills, tickets });
      }

      return res.status(403).json({ error: 'Perfil não reconhecido.' });
    } catch (error) {
      console.error('Erro ao buscar dashboard:', error);
      return res.status(500).json({ error: 'Erro ao carregar os dados do painel.' });
    }
  }

  async createReservation(req: Request, res: Response) {
    try {
      const user = req.user as any;
      const { areaName, reservationDate, notes } = req.body;

      const unit = await prisma.condoUnit.findFirst({
        where: user.role === 'CLIENT' ? { clientId: user.id } : { ownerId: user.id }
      });

      if (!unit) {
        return res.status(400).json({ error: 'Nenhuma unidade de condomínio vinculada ao seu usuário.' });
      }

      const reservation = await prisma.condoReservation.create({
        data: {
          condominiumId: unit.condominiumId,
          areaName: areaName || 'Salão de Festas',
          reservedBy: `${user.name} (Unidade ${unit.unitNumber})`,
          reservationDate: new Date(reservationDate),
          notes: notes || ''
        }
      });

      return res.status(201).json({ message: 'Reserva realizada com sucesso!', reservation });
    } catch (error) {
      console.error('Erro ao criar reserva no portal:', error);
      return res.status(500).json({ error: 'Erro ao registrar reserva de área comum.' });
    }
  }

  async createAccess(req: Request, res: Response) {
     return res.json({ message: "Acesso agora é gerido no cadastro do cliente/proprietário." });
  }
}