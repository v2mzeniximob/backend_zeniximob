import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient() as any;

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

export class PropertyController {
  async create(req: Request, res: Response) {
    try {
      const realEstateId = await getRealEstateId(req);
      if (!realEstateId) {
        return res.status(401).json({ error: 'Imobiliária não identificada no token.' });
      }

      const { title, type, category, transaction, price, area, bedrooms, bathrooms, garage, cep, address, description, imageUrls } = req.body;

      const property = await prisma.property.create({
        data: {
          title,
          type,
          category: category || 'Residencial',
          transaction,
          price: Number(price),
          area: Number(area),
          bedrooms: Number(bedrooms || 0),
          bathrooms: Number(bathrooms || 0),
          garage: Number(garage || 0),
          cep,
          address,
          description,
          imageUrls: imageUrls || [],
          realEstateId
        }
      });

      return res.status(201).json(property);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao criar imóvel.' });
    }
  }

  async list(req: Request, res: Response) {
    try {
      const realEstateId = await getRealEstateId(req);
      if (!realEstateId) {
        return res.status(401).json({ error: 'Imobiliária não identificada no token.' });
      }

      const properties = await prisma.property.findMany({
        where: { realEstateId },
        orderBy: { createdAt: 'desc' }
      });

      return res.json(properties);
    } catch (error) {
      return res.status(500).json({ error: 'Erro ao listar imóveis.' });
    }
  }

  async update(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const realEstateId = await getRealEstateId(req);
      if (!realEstateId) {
        return res.status(401).json({ error: 'Imobiliária não identificada no token.' });
      }

      const { title, type, category, transaction, price, area, bedrooms, bathrooms, garage, cep, address, description, imageUrls } = req.body;

      const property = await prisma.property.update({
        where: { id, realEstateId },
        data: {
          title,
          type,
          category,
          transaction,
          price: Number(price),
          area: Number(area),
          bedrooms: Number(bedrooms || 0),
          bathrooms: Number(bathrooms || 0),
          garage: Number(garage || 0),
          cep,
          address,
          description,
          imageUrls: imageUrls || []
        }
      });

      return res.json(property);
    } catch (error) {
      return res.status(500).json({ error: 'Erro ao atualizar imóvel.' });
    }
  }

  async toggleStatus(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const realEstateId = await getRealEstateId(req);
      if (!realEstateId) {
        return res.status(401).json({ error: 'Imobiliária não identificada no token.' });
      }

      const property = await prisma.property.findUnique({ where: { id, realEstateId } });
      if (!property) return res.status(404).json({ error: 'Imóvel não encontrado.' });

      const updated = await prisma.property.update({
        where: { id },
        data: { isActive: !property.isActive }
      });

      return res.json(updated);
    } catch (error) {
      return res.status(500).json({ error: 'Erro ao alterar status do imóvel.' });
    }
  }

  async listPublicByStore(req: Request, res: Response) {
    try {
      const { slug } = req.params;
      const slugStr = Array.isArray(slug) ? slug[0] : (slug as string);

      const realEstate = await prisma.realEstate.findUnique({
        where: { slug: slugStr, isActive: true },
        select: { id: true, tradeName: true, corporateName: true, address: true, phone: true, email: true }
      });

      if (!realEstate) return res.status(404).json({ error: 'Imobiliária não encontrada.' });

      const [properties, brokers] = await Promise.all([
        prisma.property.findMany({ where: { realEstateId: realEstate.id, isActive: true }, orderBy: { createdAt: 'desc' } }),
        prisma.broker.findMany({ where: { realEstateId: realEstate.id, isActive: true }, select: { id: true, name: true, creci: true, phone: true } })
      ]);

      return res.json({ realEstate, properties, brokers });
    } catch (error) {
      return res.status(500).json({ error: 'Erro ao carregar vitrine da loja.' });
    }
  }
}