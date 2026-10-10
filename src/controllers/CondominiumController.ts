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
          // Inclui a contagem de quantos imóveis usam este condomínio (útil para dashboards)
          _count: { select: { properties: true } }
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
        where: { id, realEstateId }, // Segurança: Só atualiza se for da mesma loja
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
}