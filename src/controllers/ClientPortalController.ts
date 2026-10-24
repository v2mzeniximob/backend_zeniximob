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

      // Busca a unidade de condomínio vinculada ao cliente ou proprietário logado
      const condoUnit = await prisma.condoUnit.findFirst({
        where: user.role === 'CLIENT' ? { clientId: user.id } : { ownerId: user.id },
        include: { condominium: true }
      });

      let condoBills = [];
      let condoReservations = [];
      let condoAssemblies = [];
      let condoOccurrences = [];

      if (condoUnit) {
        // Busca boletos da unidade
        condoBills = await prisma.condoBill.findMany({
          where: { unitId: condoUnit.id },
          include: { condominium: true, unit: true },
          orderBy: { dueDate: 'desc' }
        });

        // Busca reservas de áreas comuns do condomínio
        condoReservations = await prisma.condoReservation.findMany({
          where: { condominiumId: condoUnit.condominiumId },
          orderBy: { reservationDate: 'asc' }
        });

        // Busca reuniões e atas publicadas
        condoAssemblies = await prisma.condoAssembly.findMany({
          where: { condominiumId: condoUnit.condominiumId },
          orderBy: { assemblyDate: 'desc' }
        });

        // Busca ocorrências do condomínio
        condoOccurrences = await prisma.condoOccurrence.findMany({
          where: { condominiumId: condoUnit.condominiumId },
          orderBy: { createdAt: 'desc' }
        });
      }

      // Demais dados de contratos / imóveis do portal...
      const contracts = await prisma.contract.findMany({
        where: { clientId: user.id },
        include: { property: true, invoices: true }
      });

      const properties = await prisma.property.findMany({
        where: { ownerId: user.id },
        include: { contracts: { include: { invoices: true } } }
      });

      const tickets = await prisma.ticket.findMany({
        where: user.role === 'CLIENT' ? { clientId: user.id } : { propertyId: { in: properties.map((p: { id: string }) => p.id) } },
        include: { messages: true }
      });

      return res.json({
        contracts,
        properties,
        tickets,
        condoBills,
        condoReservations,
        condoAssemblies,
        condoOccurrences
      });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao carregar dados do portal.' });
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