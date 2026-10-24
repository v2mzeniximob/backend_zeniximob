import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import process from 'process';

const prisma = new PrismaClient() as any;
const secret = process.env.JWT_SECRET || 'zeniximob_super_secret_key_2024';

// Helper seguro para extrair os dados do cliente/proprietário logado no portal
async function getPortalUser(req: Request): Promise<{ id: string; role: string; name: string; realEstateId?: string | null } | null> {
  const reqAny = req as any;
  let id = reqAny.user?.id || reqAny.userId || reqAny.id;
  let role = reqAny.user?.role || reqAny.userRole || reqAny.role;
  let name = reqAny.user?.name || '';
  let realEstateId = reqAny.user?.realEstateId || reqAny.realEstateId || null;

  // Fallback: decodifica diretamente o Bearer token caso o authMiddleware só tenha populado userId
  if ((!id || !role) && req.headers.authorization) {
    try {
      const token = req.headers.authorization.replace('Bearer ', '').trim();
      const decoded = jwt.verify(token, secret) as any;
      id = id || decoded.id || decoded.sub;
      role = role || decoded.role;
      name = name || decoded.name || '';
      realEstateId = realEstateId || decoded.realEstateId || null;
    } catch (e) {
      // ignora erro de decode se já tiver id
    }
  }

  if (!id) return null;

  // Busca o cadastro no banco para garantir o role correto e o nome atualizado
  if (role === 'CLIENT' || !role) {
    const client = await prisma.client.findUnique({ where: { id } }).catch(() => null);
    if (client) {
      return {
        id: client.id,
        role: 'CLIENT',
        name: client.name || name || 'Cliente',
        realEstateId: client.realEstateId || realEstateId
      };
    }
  }

  if (role === 'OWNER' || !role) {
    const owner = await prisma.owner.findUnique({ where: { id } }).catch(() => null);
    if (owner) {
      return {
        id: owner.id,
        role: 'OWNER',
        name: owner.name || owner.corporateName || name || 'Proprietário',
        realEstateId: owner.realEstateId || realEstateId
      };
    }
  }

  return { id, role: role || 'CLIENT', name: name || 'Morador', realEstateId };
}

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
      const user = await getPortalUser(req);
      if (!user) {
        return res.status(401).json({ error: 'Sessão inválida ou expirada.' });
      }

      // 1. Busca Contratos, Imóveis e Chamados do cliente/proprietário
      const contracts = await prisma.contract.findMany({
        where: { clientId: user.id },
        include: { property: true, invoices: { orderBy: { dueDate: 'asc' } } },
        orderBy: { createdAt: 'desc' }
      }).catch((err: any) => {
        console.error('Erro ao buscar contratos no portal:', err);
        return [];
      });

      const properties = await prisma.property.findMany({
        where: { ownerId: user.id },
        include: { contracts: { include: { invoices: true } } },
        orderBy: { createdAt: 'desc' }
      }).catch((err: any) => {
        console.error('Erro ao buscar imóveis no portal:', err);
        return [];
      });

      const tickets = await prisma.ticket.findMany({
        where: user.role === 'CLIENT'
          ? { clientId: user.id }
          : { propertyId: { in: properties.map((p: { id: string }) => p.id) } },
        include: { messages: { orderBy: { createdAt: 'asc' } } },
        orderBy: { createdAt: 'desc' }
      }).catch(() => []);

      // Dados de temporada (se existirem)
      const seasonProperties = properties.filter((p: any) => p.isSeason || p.purpose === 'Temporada' || p.type === 'Temporada');
      const seasonBookings = await prisma.seasonBooking?.findMany({
        where: user.role === 'CLIENT'
          ? { clientId: user.id }
          : { propertyId: { in: properties.map((p: { id: string }) => p.id) } },
        include: { property: true }
      }).catch(() => []) || [];

      // 2. Busca TODAS as unidades de condomínio vinculadas ao cliente ou proprietário (por ID ou Nome)
      const userUnits = await prisma.condoUnit.findMany({
        where: user.role === 'CLIENT'
          ? {
              OR: [
                { clientId: user.id },
                ...(user.name ? [{ tenantName: { contains: user.name, mode: 'insensitive' } }] : [])
              ]
            }
          : {
              OR: [
                { ownerId: user.id },
                ...(user.name ? [{ ownerName: { contains: user.name, mode: 'insensitive' } }] : [])
              ]
            },
        include: { condominium: true }
      }).catch((err: any) => {
        console.error('Erro ao buscar unidades do condomínio no portal:', err);
        return [];
      });

      const unitIds = userUnits.map((u: any) => u.id);

      // Reúne os IDs de condomínio tanto das unidades vinculadas quanto dos imóveis dos contratos
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
      const user = await getPortalUser(req);
      if (!user) return res.status(401).json({ error: 'Não autorizado.' });

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
          reservedBy: `${user.name} (${user.role === 'CLIENT' ? 'Inquilino' : 'Proprietário'} - Unid. ${unit.unitNumber})`,
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
      const user = await getPortalUser(req);
      if (!user) return res.status(401).json({ error: 'Não autorizado.' });

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
          reportedBy: `${user.name} (${user.role === 'CLIENT' ? 'Inquilino' : 'Proprietário'} - Unid. ${unit.unitNumber})`
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