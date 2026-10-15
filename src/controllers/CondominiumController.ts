import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient() as any;

// Helper para encontrar a imobiliária correta (Corretor ou Admin)
async function getRealEstateId(req: Request): Promise<string | null> {
  const reqAny = req as any;
  if (reqAny.realEstateId) return reqAny.realEstateId;
  if (reqAny.user?.realEstateId) return reqAny.user.realEstateId;
  const userId = reqAny.userId || reqAny.user?.id;
  if (!userId) return null;
  const store = await prisma.realEstate.findUnique({ where: { id: userId } });
  if (store) return store.id;
  const broker = await prisma.broker.findUnique({ where: { id: userId } });
  if (broker) return broker.realEstateId;
  return null;
}

export class CondominiumController {
  
  async create(req: Request, res: Response) {
    try {
      const realEstateId = await getRealEstateId(req);
      if (!realEstateId) return res.status(403).json({ error: 'Acesso negado.' });

      const {
        cnpj, name, cep, address, neighborhood, city, state, type,
        adminName, managerName, email, phone, towerOrBlock,
        privateArea, hasGarage, hasCoveredGarage
      } = req.body;

      const condominium = await prisma.condominium.create({
        data: {
          name, cnpj, cep, address, neighborhood, city, state, type,
          adminName, managerName, email, phone, towerOrBlock,
          privateArea: privateArea ? Number(privateArea) : null,
          hasGarage: Boolean(hasGarage),
          hasCoveredGarage: Boolean(hasCoveredGarage),
          realEstateId
        }
      });

      return res.status(201).json(condominium);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao cadastrar condomínio.' });
    }
  }

  async list(req: Request, res: Response) {
    try {
      const realEstateId = await getRealEstateId(req);
      if (!realEstateId) return res.status(403).json({ error: 'Acesso negado.' });

      const condominiums = await prisma.condominium.findMany({
        where: { realEstateId },
        include: {
          properties: true,
          units: true,
          expenses: true,
          reservations: true,
          occurrences: true,
          _count: { select: { properties: true, units: true } }
        },
        orderBy: { name: 'asc' }
      });

      return res.json(condominiums);
    } catch (error) {
      return res.status(500).json({ error: 'Erro ao listar condomínios.' });
    }
  }

  async update(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const realEstateId = await getRealEstateId(req);
      if (!realEstateId) return res.status(403).json({ error: 'Acesso negado.' });

      const {
        cnpj, name, cep, address, neighborhood, city, state, type,
        adminName, managerName, email, phone, towerOrBlock,
        privateArea, hasGarage, hasCoveredGarage
      } = req.body;

      const condominium = await prisma.condominium.update({
        where: { id, realEstateId },
        data: {
          name, cnpj, cep, address, neighborhood, city, state, type,
          adminName, managerName, email, phone, towerOrBlock,
          privateArea: privateArea ? Number(privateArea) : null,
          hasGarage: Boolean(hasGarage),
          hasCoveredGarage: Boolean(hasCoveredGarage)
        }
      });

      return res.json(condominium);
    } catch (error) {
      return res.status(500).json({ error: 'Erro ao atualizar condomínio.' });
    }
  }

  async toggleStatus(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const realEstateId = await getRealEstateId(req);
      if (!realEstateId) return res.status(403).json({ error: 'Acesso negado.' });

      const condominium = await prisma.condominium.findUnique({
        where: { id, realEstateId }
      });

      if (!condominium) return res.status(404).json({ error: 'Condomínio não encontrado.' });

      const updated = await prisma.condominium.update({
        where: { id },
        data: { isActive: !condominium.isActive }
      });

      return res.json(updated);
    } catch (error) {
      return res.status(500).json({ error: 'Erro ao alterar status do condomínio.' });
    }
  }

  // ==========================================
  // GESTÃO DE UNIDADES (APARTAMENTOS / CASAS)
  // ==========================================
  async createUnit(req: Request, res: Response) {
    try {
      const { condominiumId } = req.params;
      const { unitNumber, block, floor, fractionIdeal, ownerName, tenantName } = req.body;

      const unit = await prisma.condoUnit.create({
        data: {
          condominiumId,
          unitNumber,
          block,
          floor: floor ? Number(floor) : null,
          fractionIdeal: fractionIdeal ? Number(fractionIdeal) : 1.0,
          ownerName,
          tenantName
        }
      });

      return res.status(201).json(unit);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao cadastrar unidade do condomínio.' });
    }
  }

  async listUnits(req: Request, res: Response) {
    try {
      const { condominiumId } = req.params;
      const units = await prisma.condoUnit.findMany({
        where: { condominiumId },
        orderBy: { unitNumber: 'asc' }
      });
      return res.json(units);
    } catch (error) {
      return res.status(500).json({ error: 'Erro ao listar unidades.' });
    }
  }

  // ==========================================
  // RATEIO DE DESPESAS DO CONDOMÍNIO
  // ==========================================
  async createExpense(req: Request, res: Response) {
    try {
      const { condominiumId } = req.params;
      const { description, amount, dueDate, category } = req.body;

      const expense = await prisma.condoExpense.create({
        data: {
          condominiumId,
          description,
          amount: Number(amount),
          dueDate: new Date(dueDate),
          category: category || 'Manutenção'
        }
      });

      return res.status(201).json(expense);
    } catch (error) {
      return res.status(500).json({ error: 'Erro ao lançar despesa condominial.' });
    }
  }

  async listExpenses(req: Request, res: Response) {
    try {
      const { condominiumId } = req.params;
      const expenses = await prisma.condoExpense.findMany({
        where: { condominiumId },
        orderBy: { dueDate: 'desc' }
      });
      return res.json(expenses);
    } catch (error) {
      return res.status(500).json({ error: 'Erro ao listar despesas.' });
    }
  }

  // ==========================================
  // RESERVAS DE ÁREAS COMUNS
  // ==========================================
  async createReservation(req: Request, res: Response) {
    try {
      const { condominiumId } = req.params;
      const { areaName, reservedBy, reservationDate, notes } = req.body;

      const reservation = await prisma.condoReservation.create({
        data: {
          condominiumId,
          areaName,
          reservedBy,
          reservationDate: new Date(reservationDate),
          notes
        }
      });

      return res.status(201).json(reservation);
    } catch (error) {
      return res.status(500).json({ error: 'Erro ao registrar reserva de área comum.' });
    }
  }

  async listReservations(req: Request, res: Response) {
    try {
      const { condominiumId } = req.params;
      const reservations = await prisma.condoReservation.findMany({
        where: { condominiumId },
        orderBy: { reservationDate: 'asc' }
      });
      return res.json(reservations);
    } catch (error) {
      return res.status(500).json({ error: 'Erro ao listar reservas.' });
    }
  }

  // ==========================================
  // LIVRO DE OCORRÊNCIAS
  // ==========================================
  async createOccurrence(req: Request, res: Response) {
    try {
      const { condominiumId } = req.params;
      const { title, description, reportedBy, priority } = req.body;

      const occurrence = await prisma.condoOccurrence.create({
        data: {
          condominiumId,
          title,
          description,
          reportedBy,
          priority: priority || 'Normal'
        }
      });

      return res.status(201).json(occurrence);
    } catch (error) {
      return res.status(500).json({ error: 'Erro ao registrar ocorrência.' });
    }
  }

  async listOccurrences(req: Request, res: Response) {
    try {
      const { condominiumId } = req.params;
      const occurrences = await prisma.condoOccurrence.findMany({
        where: { condominiumId },
        orderBy: { createdAt: 'desc' }
      });
      return res.json(occurrences);
    } catch (error) {
      return res.status(500).json({ error: 'Erro ao listar ocorrências.' });
    }
  }
}