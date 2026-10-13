import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient() as any;

export class ValuationController {

  // 1. BUSCAR IMÓVEIS COMPARÁVEIS NA BASE DA IMOBILIÁRIA
  async findComparables(req: Request, res: Response) {
    try {
      const user = req.user as any;
      const realEstateId = user?.realEstateId || user?.id;
      if (!realEstateId) return res.status(403).json({ error: 'Acesso negado.' });

      const { type, transaction, neighborhood, city } = req.query;

      const whereClause: any = {
        realEstateId,
        area: { gt: 0 } // Garante que só traz imóveis com área preenchida para não dividir por zero
      };

      if (type) whereClause.type = String(type);
      if (transaction) whereClause.transaction = String(transaction);

      // Busca todos os imóveis do mesmo tipo e transação na loja
      const properties = await prisma.property.findMany({
        where: whereClause,
        select: {
          id: true,
          title: true,
          type: true,
          transaction: true,
          price: true,
          area: true,
          bedrooms: true,
          bathrooms: true,
          garage: true,
          neighborhood: true,
          city: true,
          imageUrls: true,
          rentStatus: true
        },
        orderBy: { createdAt: 'desc' }
      });

      // Filtra priorizando o mesmo bairro ou cidade (case-insensitive)
      const targetNeighborhood = neighborhood ? String(neighborhood).toLowerCase().trim() : '';
      const targetCity = city ? String(city).toLowerCase().trim() : '';

      const formatted = properties.map((p: any) => ({
        ...p,
        sqmPrice: p.price / p.area,
        exactNeighborhoodMatch: targetNeighborhood
          ? (p.neighborhood || '').toLowerCase().includes(targetNeighborhood)
          : true,
        cityMatch: targetCity
          ? (p.city || '').toLowerCase().includes(targetCity)
          : true
      }));

      // Ordena colocando os do mesmo bairro primeiro
      formatted.sort((a: any, b: any) => {
        if (a.exactNeighborhoodMatch && !b.exactNeighborhoodMatch) return -1;
        if (!a.exactNeighborhoodMatch && b.exactNeighborhoodMatch) return 1;
        return 0;
      });

      return res.json(formatted);
    } catch (error) {
      console.error('Erro ao buscar comparáveis:', error);
      return res.status(500).json({ error: 'Erro ao buscar imóveis comparáveis.' });
    }
  }

  // 2. SALVAR ESTUDO DE MERCADO (LAUDO PTAM)
  async create(req: Request, res: Response) {
    try {
      const user = req.user as any;
      const realEstateId = user?.realEstateId || user?.id;
      if (!realEstateId) return res.status(403).json({ error: 'Acesso negado.' });

      const {
        ownerName, ownerPhone, propertyTitle, address, neighborhood, city,
        type, transaction, area, bedrooms, bathrooms, garage,
        conservationState, avgSqmPrice, estimatedPrice, minPrice, maxPrice,
        comparablesJson, brokerName, brokerCreci, notes
      } = req.body;

      const valuation = await prisma.propertyValuation.create({
        data: {
          realEstateId,
          ownerName,
          ownerPhone,
          propertyTitle,
          address,
          neighborhood,
          city: city || '',
          type,
          transaction,
          area: Number(area),
          bedrooms: Number(bedrooms || 0),
          bathrooms: Number(bathrooms || 0),
          garage: Number(garage || 0),
          conservationState: conservationState || 'Padrão',
          avgSqmPrice: Number(avgSqmPrice),
          estimatedPrice: Number(estimatedPrice),
          minPrice: Number(minPrice),
          maxPrice: Number(maxPrice),
          comparablesJson: comparablesJson || [],
          brokerName,
          brokerCreci,
          notes
        }
      });

      return res.status(201).json(valuation);
    } catch (error) {
      console.error('Erro ao salvar avaliação PTAM:', error);
      return res.status(500).json({ error: 'Erro ao salvar laudo de avaliação.' });
    }
  }

  // 3. LISTAR HISTÓRICO DE LAUDOS GERADOS (COM DADOS DA IMOBILIÁRIA PARA O PDF)
  async list(req: Request, res: Response) {
    try {
      const user = req.user as any;
      const realEstateId = user?.realEstateId || user?.id;
      if (!realEstateId) return res.status(403).json({ error: 'Acesso negado.' });

      const [valuations, realEstate] = await Promise.all([
        prisma.propertyValuation.findMany({
          where: { realEstateId },
          orderBy: { createdAt: 'desc' }
        }),
        prisma.realEstate.findUnique({
          where: { id: realEstateId },
          select: { tradeName: true, corporateName: true, cnpj: true, phone: true, email: true, logoUrl: true, address: true }
        })
      ]);

      return res.json({ valuations, realEstate });
    } catch (error) {
      console.error('Erro ao listar avaliações:', error);
      return res.status(500).json({ error: 'Erro ao listar histórico de avaliações.' });
    }
  }

  // 4. EXCLUIR LAUDO DO HISTÓRICO
  async delete(req: Request, res: Response) {
    try {
      const { id } = req.params;
      await prisma.propertyValuation.delete({ where: { id } });
      return res.json({ message: 'Laudo excluído com sucesso.' });
    } catch (error) {
      return res.status(500).json({ error: 'Erro ao excluir laudo.' });
    }
  }
}