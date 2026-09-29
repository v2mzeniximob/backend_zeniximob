import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export class PropertyController {
  // Criar Imóvel (Vinculado automaticamente à imobiliária do usuário logado)
  async create(req: Request, res: Response) {
    try {
      const realEstateId = (req as any).realEstateId || (req as any).user?.realEstateId;
      const { title, type, category, transaction, price, area, bedrooms, bathrooms, garage, cep, address, description, imageUrls } = req.body;

      if (!realEstateId) {
        return res.status(401).json({ error: 'Imobiliária não identificada no token.' });
      }

      const property = await (prisma as any).property.create({
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

  // Listar Imóveis da Imobiliária Logada
  async list(req: Request, res: Response) {
    try {
      const realEstateId = (req as any).realEstateId || (req as any).user?.realEstateId;

      const properties = await (prisma as any).property.findMany({
        where: { realEstateId },
        orderBy: { createdAt: 'desc' }
      });

      return res.json(properties);
    } catch (error) {
      return res.status(500).json({ error: 'Erro ao listar imóveis.' });
    }
  }

  // Atualizar Imóvel
  async update(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const realEstateId = (req as any).realEstateId || (req as any).user?.realEstateId;
      const { title, type, category, transaction, price, area, bedrooms, bathrooms, garage, cep, address, description, imageUrls } = req.body;

      const property = await (prisma as any).property.update({
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

  // Alternar Status (Ativo / Inativo)
  async toggleStatus(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const realEstateId = (req as any).realEstateId || (req as any).user?.realEstateId;

      const property = await (prisma as any).property.findUnique({ where: { id, realEstateId } });
      if (!property) return res.status(404).json({ error: 'Imóvel não encontrado.' });

      const updated = await (prisma as any).property.update({
        where: { id },
        data: { isActive: !property.isActive }
      });

      return res.json(updated);
    } catch (error) {
      return res.status(500).json({ error: 'Erro ao alterar status do imóvel.' });
    }
  }

  // Rota Pública: Listar imóveis de uma loja específica pelo Slug
  async listPublicByStore(req: Request, res: Response) {
    try {
      const { slug } = req.params;

      const realEstate = await prisma.realEstate.findFirst({
        where: { slug, isActive: true },
        select: { id: true, tradeName: true, corporateName: true, address: true, phone: true, email: true }
      });

      if (!realEstate) return res.status(404).json({ error: 'Imobiliária não encontrada.' });

      const [properties, brokers] = await Promise.all([
        (prisma as any).property.findMany({ where: { realEstateId: realEstate.id, isActive: true }, orderBy: { createdAt: 'desc' } }),
        (prisma as any).broker.findMany({ where: { realEstateId: realEstate.id, isActive: true }, select: { id: true, name: true, creci: true, phone: true } })
      ]);

      return res.json({ realEstate, properties, brokers });
    } catch (error) {
      return res.status(500).json({ error: 'Erro ao carregar vitrine da loja.' });
    }
  }
}