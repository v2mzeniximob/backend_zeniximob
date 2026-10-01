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

// Campos do imóvel que qualquer visitante da vitrine pode ver.
// Ficam de fora de propósito: contractUrl, inspectionUrl, tenantId e rentStatus (dados internos do aluguel),
// e qualquer coluna nova que for criada no futuro, até que alguém a libere aqui.
const PUBLIC_PROPERTY_FIELDS = {
  id: true, title: true, type: true, category: true, transaction: true,
  price: true, condoFee: true, iptu: true,
  area: true, bedrooms: true, bathrooms: true, garage: true, yearBuilt: true, amenities: true,
  cep: true, address: true, neighborhood: true, city: true, state: true, latitude: true, longitude: true,
  description: true, imageUrls: true, isActive: true,
  realEstateId: true, brokerId: true, createdAt: true, updatedAt: true
};

export class PropertyController {

  async create(req: Request, res: Response) {
    try {
      const realEstateId = await getRealEstateId(req);
      if (!realEstateId) return res.status(401).json({ error: 'Não autorizado.' });

      const { 
        title, type, category, transaction, price, condoFee, iptu, area, 
        bedrooms, bathrooms, garage, yearBuilt, amenities, cep, address, 
        neighborhood, city, state, latitude, longitude, description, imageUrls, brokerId,
        ownerId,       // Vínculo com o Proprietário
        inspectionUrl  // Vistoria Inicial de Captação
      } = req.body;

      const property = await prisma.property.create({
        data: {
          title, type, category: category || 'Residencial', transaction,
          price: Number(price), condoFee: Number(condoFee || 0), iptu: Number(iptu || 0),
          area: Number(area), bedrooms: Number(bedrooms || 0), bathrooms: Number(bathrooms || 0), 
          garage: Number(garage || 0), yearBuilt: yearBuilt ? Number(yearBuilt) : null,
          amenities: amenities || [], cep, address, neighborhood, city, state,
          latitude: latitude ? Number(latitude) : null, longitude: longitude ? Number(longitude) : null,
          description, imageUrls: imageUrls || [], 
          brokerId: brokerId || null,
          ownerId: ownerId || null,
          inspectionUrl: inspectionUrl || null,
          rentStatus: 'Vago',
          realEstateId
        },
        include: { 
          broker: { select: { id: true, name: true, phone: true } },
          owner: { select: { id: true, name: true, phone: true } }
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
      if (!realEstateId) return res.status(403).json({ error: 'Acesso negado.' });

      const properties = await prisma.property.findMany({
        where: { realEstateId },
        include: {
          broker: { select: { id: true, name: true, phone: true } },
          owner: { select: { id: true, name: true, phone: true, bankData: true } },
          contracts: {
            where: { status: 'Ativo' },
            select: { id: true, rentValue: true, status: true, tenant: { select: { name: true } } }
          }
        },
        orderBy: { createdAt: 'desc' }
      });

      return res.json(properties);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao listar imóveis.' });
    }
  }

  async update(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const realEstateId = await getRealEstateId(req);
      if (!realEstateId) return res.status(401).json({ error: 'Não autorizado.' });

      const { 
        title, type, category, transaction, price, condoFee, iptu, area, 
        bedrooms, bathrooms, garage, yearBuilt, amenities, cep, address, 
        neighborhood, city, state, latitude, longitude, description, imageUrls, brokerId,
        ownerId, inspectionUrl, rentStatus
      } = req.body;

      const property = await prisma.property.update({
        where: { id, realEstateId },
        data: {
          title, type, category, transaction, 
          price: price !== undefined ? Number(price) : undefined, 
          condoFee: condoFee !== undefined ? Number(condoFee || 0) : undefined, 
          iptu: iptu !== undefined ? Number(iptu || 0) : undefined,
          area: area !== undefined ? Number(area) : undefined, 
          bedrooms: bedrooms !== undefined ? Number(bedrooms || 0) : undefined, 
          bathrooms: bathrooms !== undefined ? Number(bathrooms || 0) : undefined, 
          garage: garage !== undefined ? Number(garage || 0) : undefined, 
          yearBuilt: yearBuilt ? Number(yearBuilt) : null,
          amenities: amenities || [], cep, address, neighborhood, city, state,
          latitude: latitude ? Number(latitude) : null, longitude: longitude ? Number(longitude) : null,
          description, imageUrls: imageUrls || [], 
          brokerId: brokerId === "" ? null : brokerId,
          ownerId: ownerId === "" ? null : ownerId,
          inspectionUrl: inspectionUrl === "" ? null : inspectionUrl,
          rentStatus: rentStatus || undefined
        },
        include: { 
          broker: { select: { id: true, name: true, phone: true } },
          owner: { select: { id: true, name: true, phone: true } }
        }
      });
      return res.json(property);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao atualizar imóvel.' });
    }
  }

  async toggleStatus(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const realEstateId = await getRealEstateId(req);
      if (!realEstateId) return res.status(401).json({ error: 'Não autorizado.' });

      const property = await prisma.property.findUnique({ where: { id, realEstateId } });
      if (!property) return res.status(404).json({ error: 'Imóvel não encontrado.' });

      const updated = await prisma.property.update({
        where: { id }, data: { isActive: !property.isActive }
      });
      return res.json(updated);
    } catch (error) {
      return res.status(500).json({ error: 'Erro ao alterar status.' });
    }
  }

  // Vitrine (Todos os imóveis)
  async listPublicByStore(req: Request, res: Response) {
    try {
      const { slug } = req.params;
      
      const realEstate = await prisma.realEstate.findUnique({
        where: { slug: slug as string, isActive: true }
      });

      if (!realEstate) return res.status(404).json({ error: 'Imobiliária não encontrada.' });

      const [properties, brokers] = await Promise.all([
        prisma.property.findMany({ 
          where: { realEstateId: realEstate.id, isActive: true }, 
          select: PUBLIC_PROPERTY_FIELDS,
          orderBy: { createdAt: 'desc' }
        }),
        prisma.broker.findMany({ 
          where: { realEstateId: realEstate.id, isActive: true }, 
          select: { id: true, name: true, creci: true, phone: true, profileImageUrl: true } 
        })
      ]);

      return res.json({ realEstate, properties, brokers });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao carregar vitrine.' });
    }
  }

  // Detalhes de UM imóvel na vitrine
  async getPublicProperty(req: Request, res: Response) {
    try {
      const { slug, propertyId } = req.params;

      const realEstate = await prisma.realEstate.findUnique({
        where: { slug: slug as string, isActive: true }
      });

      if (!realEstate) return res.status(404).json({ error: 'Imobiliária não encontrada.' });

      const property = await prisma.property.findFirst({
        where: { id: propertyId, realEstateId: realEstate.id, isActive: true },
        include: { 
          broker: { 
            select: { name: true, creci: true, phone: true, email: true, profileImageUrl: true } 
          } 
        }
      });

      if (!property) return res.status(404).json({ error: 'Imóvel não encontrado.' });

      return res.json({ realEstate, property });
    } catch (error) {
      return res.status(500).json({ error: 'Erro ao carregar detalhes do imóvel.' });
    }
  }

  async updateRentalInfo(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const realEstateId = await getRealEstateId(req);
      const { rentStatus, inspectionUrl, contractUrl, tenantId } = req.body;

      if (!realEstateId) return res.status(403).json({ error: 'Acesso negado.' });

      const property = await prisma.property.findFirst({
        where: { id, realEstateId }
      });

      if (!property) return res.status(404).json({ error: 'Imóvel não encontrado.' });

      const updatedProperty = await prisma.property.update({
        where: { id },
        data: {
          rentStatus,
          inspectionUrl,
          contractUrl,
          tenantId: tenantId || null
        } as any
      });

      return res.json(updatedProperty);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao atualizar dados de aluguel do imóvel.' });
    }
  }
}