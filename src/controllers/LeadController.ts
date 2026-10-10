import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export class LeadController {
  
  // 1. Criar um novo Lead (Cliente)
  async create(req: Request, res: Response) {
    try {
      const user = req.user as any;
      const realEstateId = user?.realEstateId || user?.id;
      if (!realEstateId) return res.status(403).json({ error: 'Acesso negado.' });

      const { 
        name, phone, email, interest, notes, propertyId, brokerId,
        // PARÂMETROS DO RADAR (MATCHMAKING)
        searchType, searchTransaction, searchMinPrice, searchMaxPrice, 
        searchNeighborhoods, searchMinBedrooms, searchMinGarage
      } = req.body;

      const lead = await (prisma as any).lead.create({
        data: {
          name, phone, email, interest, notes,
          stage: 'Novo', // O Lead entra sempre como "Novo" no funil
          propertyId: propertyId || null,
          brokerId: brokerId || null,
          
          // DADOS DO RADAR
          searchType: searchType || null,
          searchTransaction: searchTransaction || null,
          searchMinPrice: searchMinPrice ? Number(searchMinPrice) : null,
          searchMaxPrice: searchMaxPrice ? Number(searchMaxPrice) : null,
          searchNeighborhoods: searchNeighborhoods || [],
          searchMinBedrooms: searchMinBedrooms ? Number(searchMinBedrooms) : null,
          searchMinGarage: searchMinGarage ? Number(searchMinGarage) : null,

          realEstateId
        }
      });

      // Regista automaticamente o primeiro evento no histórico do cliente
      await (prisma as any).leadHistory.create({
        data: {
          leadId: lead.id,
          actionType: 'Sistema',
          description: 'Lead cadastrado no sistema.'
        }
      });

      return res.status(201).json(lead);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao criar lead.' });
    }
  }

  // 2. Listar todos os Leads da imobiliária
  async list(req: Request, res: Response) {
    try {
      const user = req.user as any;
      const realEstateId = user?.realEstateId || user?.id;
      if (!realEstateId) return res.status(403).json({ error: 'Acesso negado.' });

      const { brokerId, stage } = req.query;

      const whereClause: any = { realEstateId };
      if (brokerId) whereClause.brokerId = brokerId;
      if (stage) whereClause.stage = stage;

      const leads = await (prisma as any).lead.findMany({
        where: whereClause,
        include: {
          property: { select: { title: true, type: true, category: true, transaction: true, price: true } },
          broker: { select: { name: true } },
          history: { orderBy: { date: 'desc' } }
        },
        orderBy: { updatedAt: 'desc' }
      });

      return res.json(leads);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao listar leads.' });
    }
  }

  // 3. Atualizar Dados Básicos, Funil e Perfil do Radar
  async update(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const user = req.user as any;
      const realEstateId = user?.realEstateId || user?.id;
      if (!realEstateId) return res.status(403).json({ error: 'Acesso negado.' });

      const existingLead = await (prisma as any).lead.findUnique({ where: { id } });
      if (!existingLead || existingLead.realEstateId !== realEstateId) {
        return res.status(404).json({ error: 'Lead não encontrado.' });
      }

      const { 
        name, phone, email, interest, stage, notes, propertyId, brokerId,
        searchType, searchTransaction, searchMinPrice, searchMaxPrice, 
        searchNeighborhoods, searchMinBedrooms, searchMinGarage
      } = req.body;

      if (stage && stage !== existingLead.stage) {
        await (prisma as any).leadHistory.create({
          data: {
            leadId: id,
            actionType: 'Mudança de Estágio',
            description: `Lead movido de "${existingLead.stage}" para "${stage}".`
          }
        });
      }

      const updatedLead = await (prisma as any).lead.update({
        where: { id },
        data: { 
          name, phone, email, interest, stage, notes, propertyId, brokerId,
          searchType: searchType || null,
          searchTransaction: searchTransaction || null,
          searchMinPrice: searchMinPrice ? Number(searchMinPrice) : null,
          searchMaxPrice: searchMaxPrice ? Number(searchMaxPrice) : null,
          searchNeighborhoods: searchNeighborhoods || [],
          searchMinBedrooms: searchMinBedrooms ? Number(searchMinBedrooms) : null,
          searchMinGarage: searchMinGarage ? Number(searchMinGarage) : null,
        }
      });

      return res.json(updatedLead);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao atualizar lead.' });
    }
  }

  // 4. Adicionar um evento ao Histórico
  async addHistoryEvent(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { actionType, description } = req.body;
      const user = req.user as any;
      const realEstateId = user?.realEstateId || user?.id;

      const lead = await (prisma as any).lead.findUnique({ where: { id: id } });
      if (!lead || lead.realEstateId !== realEstateId) {
        return res.status(404).json({ error: 'Lead não encontrado.' });
      }

      const historyEvent = await (prisma as any).leadHistory.create({
        data: {
          leadId: id,
          actionType,
          description
        }
      });

      await (prisma as any).lead.update({ where: { id: id }, data: { updatedAt: new Date() } });

      return res.status(201).json(historyEvent);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao adicionar histórico.' });
    }
  }

  // ==========================================
  // ALGORITMO DE MATCHMAKING (RADAR)
  // ==========================================
  async getMatches(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const user = req.user as any;
      const realEstateId = user?.realEstateId || user?.id;

      const lead = await (prisma as any).lead.findUnique({ where: { id } });
      if (!lead || lead.realEstateId !== realEstateId) {
        return res.status(404).json({ error: 'Lead não encontrado.' });
      }

      // Se o cliente não tiver um perfil de busca preenchido, não há como fazer match
      if (!lead.searchTransaction && !lead.searchType && !lead.searchMaxPrice) {
        return res.json([]); 
      }

      // Filtro duro: Busca apenas imóveis ativos da imobiliária
      const whereClause: any = { 
        realEstateId, 
        isActive: true 
      };
      
      // Se o cliente especificou que só quer "Aluguel" ou "Venda", filtramos na base
      if (lead.searchTransaction && lead.searchTransaction !== 'Qualquer') {
        whereClause.transaction = lead.searchTransaction;
      }

      const properties = await (prisma as any).property.findMany({
        where: whereClause,
        include: {
          condominium: { select: { name: true } },
          broker: { select: { name: true, phone: true } }
        }
      });

      const matches = properties.map((prop: any) => {
        let score = 0;
        let breakdown = { price: 0, location: 0, typology: 0, features: 0 };

        // EIXO 1: Tipologia de Imóvel (Peso: 20%)
        if (lead.searchType && lead.searchType !== 'Qualquer') {
          if (prop.type === lead.searchType) {
            score += 20;
            breakdown.typology += 20;
          }
        } else {
          score += 20; // Se não exigiu um tipo específico, ganha os pontos
          breakdown.typology += 20;
        }

        // EIXO 2: Orçamento / Preço (Peso: 30%)
        if (lead.searchMaxPrice) {
          const min = lead.searchMinPrice || 0;
          const max = lead.searchMaxPrice;
          if (prop.price >= min && prop.price <= max) {
            score += 30;
            breakdown.price += 30;
          } else if (prop.price <= max * 1.15) {
            // Regra de Ouro: Se passar até 15% do orçamento máximo, ganha metade dos pontos (margem de negociação)
            score += 15;
            breakdown.price += 15;
          }
        } else {
          score += 30;
          breakdown.price += 30;
        }

        // EIXO 3: Localização / Bairros (Peso: 30%)
        if (lead.searchNeighborhoods && lead.searchNeighborhoods.length > 0) {
          if (lead.searchNeighborhoods.includes(prop.neighborhood)) {
            score += 30;
            breakdown.location += 30;
          }
        } else {
          score += 30;
          breakdown.location += 30;
        }

        // EIXO 4: Tamanho - Quartos e Vagas (Peso: 20%)
        let featureScore = 0;
        if (lead.searchMinBedrooms) {
          if (prop.bedrooms >= lead.searchMinBedrooms) featureScore += 10;
        } else {
          featureScore += 10;
        }
        
        if (lead.searchMinGarage) {
          if (prop.garage >= lead.searchMinGarage) featureScore += 10;
        } else {
          featureScore += 10;
        }
        
        score += featureScore;
        breakdown.features += featureScore;

        return {
          property: prop,
          score,
          breakdown
        };
      });

      // Filtra apenas matches relevantes (Acima de 40% de compatibilidade) e ordena do maior para o menor
      const filteredMatches = matches
        .filter((m: any) => m.score >= 40)
        .sort((a: any, b: any) => b.score - a.score);

      return res.json(filteredMatches);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao calcular matchmaking.' });
    }
  }
}