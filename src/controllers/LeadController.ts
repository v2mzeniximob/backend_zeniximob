import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient() as any;

// ============================================================================
// FUNÇÃO AUXILIAR 1: ESCOLHE O PRÓXIMO CORRETOR DA FILA (ROLETA CIRCULAR)
// ============================================================================
export async function pickNextBrokerInRoulette(realEstateId: string, excludeBrokerId?: string) {
  const brokers = await prisma.broker.findMany({
    where: {
      realEstateId,
      isActive: true,
      inRoulette: true
    },
    orderBy: {
      lastLeadAssignedAt: 'asc'
    }
  });

  if (!brokers || brokers.length === 0) return null;

  // Garante que quem nunca recebeu lead (null) fique no topo da fila
  brokers.sort((a: any, b: any) => {
    if (!a.lastLeadAssignedAt && b.lastLeadAssignedAt) return -1;
    if (a.lastLeadAssignedAt && !b.lastLeadAssignedAt) return 1;
    if (!a.lastLeadAssignedAt && !b.lastLeadAssignedAt) return 0;
    return new Date(a.lastLeadAssignedAt).getTime() - new Date(b.lastLeadAssignedAt).getTime();
  });

  let candidates = brokers;
  if (excludeBrokerId && brokers.length > 1) {
    candidates = brokers.filter((b: any) => b.id !== excludeBrokerId);
  }

  const chosenBroker = candidates[0];
  if (!chosenBroker) return null;

  await prisma.broker.update({
    where: { id: chosenBroker.id },
    data: { lastLeadAssignedAt: new Date() }
  });

  return chosenBroker;
}

// ============================================================================
// FUNÇÃO AUXILIAR 2: VERIFICA E EXECUTA A REPESCAGEM AUTOMÁTICA (30 MIN)
// ============================================================================
async function runRepescagemCheck(realEstateId: string) {
  try {
    const store = await prisma.realEstate.findUnique({
      where: { id: realEstateId },
      select: { rouletteEnabled: true, rouletteTimeoutMinutes: true }
    });

    if (!store || !store.rouletteEnabled) return;

    const timeoutMinutes = store.rouletteTimeoutMinutes || 30;
    const cutoffTime = new Date(Date.now() - timeoutMinutes * 60 * 1000);

    const expiredLeads = await prisma.lead.findMany({
      where: {
        realEstateId,
        stage: 'Novo',
        firstContactAt: null,
        brokerId: { not: null },
        assignedAt: { lte: cutoffTime }
      },
      include: {
        broker: { select: { id: true, name: true } }
      }
    });

    if (expiredLeads.length === 0) return;

    const manager = await prisma.broker.findFirst({
      where: { realEstateId, role: 'Gerente', isActive: true },
      select: { name: true }
    });

    for (const lead of expiredLeads) {
      const oldBrokerName = lead.broker?.name || 'Corretor Anterior';
      const nextBroker = await pickNextBrokerInRoulette(realEstateId, lead.brokerId);

      if (nextBroker && nextBroker.id !== lead.brokerId) {
        await prisma.lead.update({
          where: { id: lead.id },
          data: {
            brokerId: nextBroker.id,
            assignedAt: new Date(),
            reassignedCount: (lead.reassignedCount || 0) + 1
          }
        });

        const managerNote = manager ? ` (Gerente ${manager.name} notificado no painel)` : '';

        await prisma.leadHistory.create({
          data: {
            leadId: lead.id,
            actionType: 'Sistema',
            description: `⏰ REPESCAGEM AUTOMÁTICA: ${oldBrokerName} não iniciou o atendimento dentro do prazo de ${timeoutMinutes} min. O Lead foi transferido automaticamente para ${nextBroker.name}${managerNote}.`
          }
        });
      } else {
        await prisma.lead.update({
          where: { id: lead.id },
          data: { assignedAt: new Date() }
        });
      }
    }
  } catch (error) {
    console.error('Erro ao processar repescagem automática:', error);
  }
}

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

      let finalBrokerId = brokerId || null;
      let assignedViaRouletteName: string | null = null;

      // Se não escolheu corretor manualmente, verifica se a Roleta está ativa
      if (!finalBrokerId) {
        const store = await prisma.realEstate.findUnique({
          where: { id: realEstateId },
          select: { rouletteEnabled: true }
        });

        if (store?.rouletteEnabled) {
          const picked = await pickNextBrokerInRoulette(realEstateId);
          if (picked) {
            finalBrokerId = picked.id;
            assignedViaRouletteName = picked.name;
          }
        }
      } else {
        await prisma.broker.update({
          where: { id: finalBrokerId },
          data: { lastLeadAssignedAt: new Date() }
        }).catch(() => {});
      }

      const lead = await prisma.lead.create({
        data: {
          name,
          phone,
          email: email || null,
          interest: interest || 'Comprador',
          notes: notes || null,
          stage: 'Novo', // O Lead entra sempre como "Novo" no funil
          propertyId: propertyId || null,
          brokerId: finalBrokerId,
          assignedAt: new Date(),
          firstContactAt: null,
          reassignedCount: 0,

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

      const historyDescription = assignedViaRouletteName
        ? `🎲 Lead cadastrado e distribuído pela Roleta Automática para: ${assignedViaRouletteName}.`
        : 'Lead cadastrado no sistema.';

      // Regista automaticamente o primeiro evento no histórico do cliente
      await prisma.leadHistory.create({
        data: {
          leadId: lead.id,
          actionType: 'Sistema',
          description: historyDescription
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

      // Verifica leads com prazo expirado na coluna "Novo" antes de listar
      await runRepescagemCheck(realEstateId);

      const { brokerId, stage } = req.query;

      const whereClause: any = { realEstateId };
      if (brokerId) whereClause.brokerId = brokerId;
      if (stage) whereClause.stage = stage;

      const leads = await prisma.lead.findMany({
        where: whereClause,
        include: {
          property: { select: { title: true, type: true, category: true, transaction: true, price: true } },
          broker: { select: { id: true, name: true } },
          history: { orderBy: { date: 'desc' } }
        },
        orderBy: { updatedAt: 'desc' }
      });

      // Garante que qualquer lead vindo do site sem stage definido apareça na coluna "Novo"
      const validStages = ['Novo', 'Atendimento', 'Visita', 'Proposta', 'Negociação', 'Fechado', 'Perdido'];
      const formattedLeads = leads.map((lead: any) => ({
        ...lead,
        stage: validStages.includes(lead.stage) ? lead.stage : 'Novo'
      }));

      return res.json(formattedLeads);
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

      const existingLead = await prisma.lead.findUnique({ where: { id } });
      if (!existingLead || existingLead.realEstateId !== realEstateId) {
        return res.status(404).json({ error: 'Lead não encontrado.' });
      }

      const {
        name, phone, email, interest, stage, notes, propertyId, brokerId,
        searchType, searchTransaction, searchMinPrice, searchMaxPrice,
        searchNeighborhoods, searchMinBedrooms, searchMinGarage
      } = req.body;

      const dataToUpdate: any = {};

      if (name !== undefined) dataToUpdate.name = name;
      if (phone !== undefined) dataToUpdate.phone = phone;
      if (email !== undefined) dataToUpdate.email = email;
      if (interest !== undefined) dataToUpdate.interest = interest;
      if (notes !== undefined) dataToUpdate.notes = notes;
      if (propertyId !== undefined) dataToUpdate.propertyId = propertyId || null;

      if (brokerId !== undefined && brokerId !== existingLead.brokerId) {
        dataToUpdate.brokerId = brokerId || null;
        dataToUpdate.assignedAt = new Date();
      }

      if (stage && stage !== existingLead.stage) {
        dataToUpdate.stage = stage;
        if (stage !== 'Novo' && !existingLead.firstContactAt) {
          dataToUpdate.firstContactAt = new Date();
        }

        await prisma.leadHistory.create({
          data: {
            leadId: id,
            actionType: 'Mudança de Estágio',
            description: `Lead movido de "${existingLead.stage}" para "${stage}".`
          }
        });
      }

      if (searchType !== undefined) dataToUpdate.searchType = searchType || null;
      if (searchTransaction !== undefined) dataToUpdate.searchTransaction = searchTransaction || null;
      if (searchMinPrice !== undefined) dataToUpdate.searchMinPrice = searchMinPrice ? Number(searchMinPrice) : null;
      if (searchMaxPrice !== undefined) dataToUpdate.searchMaxPrice = searchMaxPrice ? Number(searchMaxPrice) : null;
      if (searchNeighborhoods !== undefined) dataToUpdate.searchNeighborhoods = searchNeighborhoods || [];
      if (searchMinBedrooms !== undefined) dataToUpdate.searchMinBedrooms = searchMinBedrooms ? Number(searchMinBedrooms) : null;
      if (searchMinGarage !== undefined) dataToUpdate.searchMinGarage = searchMinGarage ? Number(searchMinGarage) : null;

      const updatedLead = await prisma.lead.update({
        where: { id },
        data: dataToUpdate,
        include: {
          property: { select: { title: true, type: true, category: true, transaction: true, price: true } },
          broker: { select: { id: true, name: true } },
          history: { orderBy: { date: 'desc' } }
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

      const lead = await prisma.lead.findUnique({ where: { id } });
      if (!lead || lead.realEstateId !== realEstateId) {
        return res.status(404).json({ error: 'Lead não encontrado.' });
      }

      const historyEvent = await prisma.leadHistory.create({
        data: {
          leadId: id,
          actionType,
          description
        }
      });

      const updateData: any = { updatedAt: new Date() };
      if (!lead.firstContactAt) {
        updateData.firstContactAt = new Date();
      }
      if (lead.stage === 'Novo' && ['WhatsApp', 'Ligação', 'E-mail', 'Visita'].includes(actionType)) {
        updateData.stage = 'Atendimento';
      }

      await prisma.lead.update({ where: { id }, data: updateData });

      return res.status(201).json(historyEvent);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao adicionar histórico.' });
    }
  }

  // 5. Buscar Configurações da Roleta e Fila da Vez
  async getRouletteSettings(req: Request, res: Response) {
    try {
      const user = req.user as any;
      const realEstateId = user?.realEstateId || user?.id;
      if (!realEstateId) return res.status(403).json({ error: 'Acesso negado.' });

      const [store, queue] = await Promise.all([
        prisma.realEstate.findUnique({
          where: { id: realEstateId },
          select: { rouletteEnabled: true, rouletteTimeoutMinutes: true }
        }),
        prisma.broker.findMany({
          where: { realEstateId, isActive: true, inRoulette: true },
          select: { id: true, name: true, role: true, lastLeadAssignedAt: true },
          orderBy: { lastLeadAssignedAt: 'asc' }
        })
      ]);

      queue.sort((a: any, b: any) => {
        if (!a.lastLeadAssignedAt && b.lastLeadAssignedAt) return -1;
        if (a.lastLeadAssignedAt && !b.lastLeadAssignedAt) return 1;
        if (!a.lastLeadAssignedAt && !b.lastLeadAssignedAt) return 0;
        return new Date(a.lastLeadAssignedAt).getTime() - new Date(b.lastLeadAssignedAt).getTime();
      });

      return res.json({
        rouletteEnabled: store?.rouletteEnabled ?? false,
        rouletteTimeoutMinutes: store?.rouletteTimeoutMinutes ?? 30,
        queue
      });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao carregar configurações da roleta.' });
    }
  }

  // 6. Salvar Configurações da Roleta
  async updateRouletteSettings(req: Request, res: Response) {
    try {
      const user = req.user as any;
      const realEstateId = user?.realEstateId || user?.id;
      if (!realEstateId) return res.status(403).json({ error: 'Acesso negado.' });

      const { rouletteEnabled, rouletteTimeoutMinutes } = req.body;

      const updated = await prisma.realEstate.update({
        where: { id: realEstateId },
        data: {
          rouletteEnabled: Boolean(rouletteEnabled),
          rouletteTimeoutMinutes: Number(rouletteTimeoutMinutes || 30)
        }
      });

      return res.json(updated);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao atualizar roleta.' });
    }
  }

  // ==========================================
  // 7. ALGORITMO DE MATCHMAKING (RADAR)
  // ==========================================
  async getMatches(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const user = req.user as any;
      const realEstateId = user?.realEstateId || user?.id;

      const lead = await prisma.lead.findUnique({ where: { id } });
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

      const properties = await prisma.property.findMany({
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