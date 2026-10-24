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

      const userName = userFound.name || userFound.corporateName || 'Usuário';

      const token = jwt.sign(
        { id: userFound.id, name: userName, role: role, realEstateId: userFound.realEstateId }, 
        secret, 
        { expiresIn: '7d' }
      );

      return res.json({
        token,
        user: { id: userFound.id, name: userName, role: role }
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
      const reqAny = req as any;
      let user = reqAny.user;

      if (!user && reqAny.userId) {
        user = {
          id: reqAny.userId,
          role: reqAny.userRole || 'CLIENT',
          name: reqAny.userName || 'Morador'
        };
      }

      if (!user && req.headers.authorization) {
        try {
          const token = req.headers.authorization.replace('Bearer ', '').trim();
          user = jwt.verify(token, secret);
        } catch (e) {}
      }

      if (!user || !user.id) {
        return res.status(401).json({ error: 'Sessão inválida ou expirada.' });
      }

      let clientRecord = null;
      if (user.role === 'CLIENT') {
        clientRecord = await prisma.client.findUnique({ where: { id: user.id } }).catch(() => null);
      }

      // 1. Busca segura de Contratos (evita erros de campos desconhecidos no schema)
      const allContracts = await prisma.contract.findMany({
        include: { property: true, invoices: { orderBy: { dueDate: 'asc' } } },
        orderBy: { createdAt: 'desc' }
      }).catch((err: any) => {
        console.error('Erro ao buscar contratos no portal:', err);
        return [];
      });

      let contracts: any[] = [];
      if (user.role === 'CLIENT') {
        contracts = allContracts.filter((c: any) => {
          const matchesId = c.clientId === user.id || c.tenantId === user.id || (clientRecord && c.clientId === clientRecord.id);
          const matchesDoc = clientRecord?.document && c.client?.document === clientRecord.document;
          const matchesName = clientRecord?.name && c.client?.name?.toLowerCase().includes(clientRecord.name.toLowerCase());
          return matchesId || matchesDoc || matchesName;
        });
      } else {
        const ownerProperties = await prisma.property.findMany({ where: { ownerId: user.id } }).catch(() => []);
        const propIds = ownerProperties.map((p: any) => p.id);
        contracts = allContracts.filter((c: any) => propIds.includes(c.propertyId));
      }

      const properties = await prisma.property.findMany({
        where: { ownerId: user.id },
        include: { contracts: { include: { invoices: true } } },
        orderBy: { createdAt: 'desc' }
      }).catch(() => []);

      const tickets = await prisma.ticket.findMany({
        where: user.role === 'CLIENT'
          ? { clientId: user.id }
          : { propertyId: { in: properties.map((p: { id: string }) => p.id) } },
        include: { messages: { orderBy: { createdAt: 'asc' } } },
        orderBy: { createdAt: 'desc' }
      }).catch(() => []);

      const seasonProperties = properties.filter((p: any) => p.isSeason || p.purpose === 'Temporada' || p.type === 'Temporada');
      const seasonBookings = await prisma.seasonBooking?.findMany({
        where: user.role === 'CLIENT'
          ? { clientId: user.id }
          : { propertyId: { in: properties.map((p: { id: string }) => p.id) } },
        include: { property: true }
      }).catch(() => []) || [];

      // 2. Unidades de Condomínio com filtro seguro em memória
      const allUnits = await prisma.condoUnit.findMany({
        include: { condominium: true }
      }).catch(() => []);

      const userUnits = allUnits.filter((u: any) => {
        if (user.role === 'CLIENT') {
          return u.clientId === user.id || 
                 (clientRecord && u.clientId === clientRecord.id) ||
                 (clientRecord?.name && u.tenantName?.toLowerCase().includes(clientRecord.name.toLowerCase())) ||
                 (user.name && u.tenantName?.toLowerCase().includes(user.name.toLowerCase()));
        } else {
          return u.ownerId === user.id || 
                 (clientRecord?.name && u.ownerName?.toLowerCase().includes(clientRecord.name.toLowerCase()));
        }
      });

      const unitIds = userUnits.map((u: any) => u.id);

      const condoIdsFromUnits = userUnits.map((u: any) => u.condominiumId).filter(Boolean);
      const condoIdsFromContracts = contracts.map((c: any) => c.property?.condominiumId).filter(Boolean);
      const condoIdsFromProperties = properties.map((p: any) => p.condominiumId).filter(Boolean);

      const condoIds = Array.from(new Set([
        ...condoIdsFromUnits,
        ...condoIdsFromContracts,
        ...condoIdsFromProperties
      ]));

      let condoBills: any[] = [];
      let condoReservations: any[] = [];
      let condoAssemblies: any[] = [];
      let condoOccurrences: any[] = [];

      if (unitIds.length > 0) {
        condoBills = await prisma.condoBill.findMany({
          where: { unitId: { in: unitIds } },
          include: { condominium: true, unit: true },
          orderBy: { dueDate: 'desc' }
        }).catch(() => []);
      }

      if (condoIds.length > 0) {
        condoReservations = await prisma.condoReservation.findMany({
          where: { condominiumId: { in: condoIds } },
          orderBy: { reservationDate: 'asc' }
        }).catch(() => []);

        condoAssemblies = await prisma.condoAssembly.findMany({
          where: { condominiumId: { in: condoIds } },
          orderBy: { assemblyDate: 'desc' }
        }).catch(() => []);

        condoOccurrences = await prisma.condoOccurrence.findMany({
          where: { condominiumId: { in: condoIds } },
          orderBy: { createdAt: 'desc' }
        }).catch(() => []);
      }

      return res.json({
        contracts,
        properties,
        tickets,
        seasonProperties,
        seasonBookings,
        condoBills,
        condoReservations,
        condoAssemblies,
        condoOccurrences
      });
    } catch (error) {
      console.error('Erro geral no getDashboard:', error);
      return res.status(500).json({ error: 'Erro ao carregar dados do portal.' });
    }
  }

  // ==========================================
  // 3. CRIAR RESERVA DE ÁREA COMUM PELO PORTAL
  // ==========================================
  async createReservation(req: Request, res: Response) {
    try {
      const reqAny = req as any;
      const user = reqAny.user || { id: reqAny.userId, role: reqAny.userRole || 'CLIENT', name: reqAny.userName || 'Morador' };
      const { areaName, reservationDate, notes } = req.body;

      const unit = await prisma.condoUnit.findFirst({
        where: user.role === 'CLIENT'
          ? { OR: [{ clientId: user.id }, ...(user.name ? [{ tenantName: { contains: user.name, mode: 'insensitive' } }] : [])] }
          : { OR: [{ ownerId: user.id }, ...(user.name ? [{ ownerName: { contains: user.name, mode: 'insensitive' } }] : [])] }
      });

      if (!unit) {
        return res.status(400).json({ error: 'Nenhuma unidade de condomínio vinculada ao seu usuário.' });
      }

      const reservation = await prisma.condoReservation.create({
        data: {
          condominiumId: unit.condominiumId,
          areaName: areaName || 'Salão de Festas',
          reservedBy: `${user.name || 'Morador'} (${user.role === 'CLIENT' ? 'Inquilino' : 'Proprietário'} - Unid. ${unit.unitNumber})`,
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

  // ==========================================
  // 4. REGISTRAR OCORRÊNCIA PELO PORTAL
  // ==========================================
  async createOccurrence(req: Request, res: Response) {
    try {
      const reqAny = req as any;
      const user = reqAny.user || { id: reqAny.userId, role: reqAny.userRole || 'CLIENT', name: reqAny.userName || 'Morador' };
      const { title, description, priority } = req.body;

      const unit = await prisma.condoUnit.findFirst({
        where: user.role === 'CLIENT'
          ? { OR: [{ clientId: user.id }, ...(user.name ? [{ tenantName: { contains: user.name, mode: 'insensitive' } }] : [])] }
          : { OR: [{ ownerId: user.id }, ...(user.name ? [{ ownerName: { contains: user.name, mode: 'insensitive' } }] : [])] }
      });

      if (!unit) {
        return res.status(400).json({ error: 'Nenhuma unidade de condomínio vinculada ao seu usuário.' });
      }

      const occurrence = await prisma.condoOccurrence.create({
        data: {
          condominiumId: unit.condominiumId,
          title,
          description,
          priority: priority || 'Normal',
          reportedBy: `${user.name || 'Morador'} (${user.role === 'CLIENT' ? 'Inquilino' : 'Proprietário'} - Unid. ${unit.unitNumber})`
        }
      });

      return res.status(201).json({ message: 'Ocorrência registrada com sucesso!', occurrence });
    } catch (error) {
      console.error('Erro ao criar ocorrência no portal:', error);
      return res.status(500).json({ error: 'Erro ao registrar ocorrência.' });
    }
  }

  async createAccess(req: Request, res: Response) {
    return res.json({ message: 'Acesso agora é gerido no cadastro do cliente/proprietário.' });
  }
}