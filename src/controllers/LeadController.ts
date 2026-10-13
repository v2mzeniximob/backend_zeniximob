import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient() as any;

// ============================================================================
// FUNÇÃO AUXILIAR GLOBAL: ESCOLHE O PRÓXIMO CORRETOR DA FILA (ROLETA CIRCULAR)
// Pode ser chamada pelo LeadController, WebhookController ou ClientController
// ============================================================================
export async function pickNextBrokerInRoulette(realEstateId: string, excludeBrokerId?: string) {
  const brokers = await prisma.broker.findMany({
    where: {
      realEstateId,
      isActive: true,
      inRoulette: true
    },
    orderBy: {
      lastLeadAssignedAt: 'asc' // Os que nunca receberam (null) ou receberam há mais tempo vêm primeiro
    }
  });

  if (!brokers || brokers.length === 0) return null;

  // Garante que quem tem lastLeadAssignedAt === null fique no topo absoluto da fila
  brokers.sort((a: any, b: any) => {
    if (!a.lastLeadAssignedAt && b.lastLeadAssignedAt) return -1;
    if (a.lastLeadAssignedAt && !b.lastLeadAssignedAt) return 1;
    if (!a.lastLeadAssignedAt && !b.lastLeadAssignedAt) return 0;
    return new Date(a.lastLeadAssignedAt).getTime() - new Date(b.lastLeadAssignedAt).getTime();
  });

  // Se for uma Repescagem e houver mais de 1 corretor na fila, pula o corretor atrasado
  let candidates = brokers;
  if (excludeBrokerId && brokers.length > 1) {
    candidates = brokers.filter((b: any) => b.id !== excludeBrokerId);
  }

  const chosenBroker = candidates[0];

  // Atualiza o relógio do corretor sorteado para ele ir para o final da fila
  await prisma.broker.update({
    where: { id: chosenBroker.id },
    data: { lastLeadAssignedAt: new Date() }
  });

  return chosenBroker;
}

export class LeadController {

  // ============================================================================
  // MOTOR INTERNO DE REPESCAGEM AUTOMÁTICA (SLA DE ATENDIMENTO)
  // ============================================================================
  private async runRepescagemCheck(realEstateId: string) {
    try {
      const store = await prisma.realEstate.findUnique({
        where: { id: realEstateId },
        select: { rouletteEnabled: true, rouletteTimeoutMinutes: true }
      });

      if (!store || !store.rouletteEnabled) return;

      const timeoutMinutes = store.rouletteTimeoutMinutes || 30;
      const cutoffTime = new Date(Date.now() - timeoutMinutes * 60 * 1000);

      // Busca leads que ainda estão na coluna "Novo", sem primeiro contato, e cujo tempo estourou
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

      // Busca o gerente ativo da loja (para constar no alerta do histórico)
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
          // Se só existe 1 corretor na fila, apenas renova o timer para não entrar em loop
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
  
  // 1. Criar um novo Lead (Manual ou Interno)
  async create(req: Request, res: Response) {
    try {
      const user = req.user as any;
      const realEstateId = user?.realEstateId || user?.id;
      if (!realEstateId) return res.status(403).json({ error: 'Acesso negado.' });

      const { 
        name, phone, email, interest, notes, propertyId, brokerId,
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
        // Se escolheu manualmente, atualiza a vez desse corretor também
        await prisma.broker.update({
          where: { id: finalBrokerId },
          data: { lastLeadAssignedAt: new Date() }
        }).catch(() => {});
      }

      const lead = await prisma.lead.create({
        data: {
          name, phone, email, interest: interest || 'Comprador', notes,
          stage: 'Novo',
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

      const historyMsg = assignedViaRouletteName
        ? `🎲 Lead cadastrado e distribuído pela Roleta Automática para o corretor da vez: ${assignedViaRouletteName}.`
        : 'Lead cadastrado no sistema.';

      await prisma.leadHistory.create({
        data: {
          leadId: lead.id,
          actionType: 'Sistema',
          description: historyMsg
        }
      });

      return res.status(201).json(lead);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao criar lead.' });
    }
  }

  // 2. Listar todos os Leads da imobiliária (Já executa a checagem de Repescagem antes de devolver!)
  async list(req: Request, res: Response) {
    try {
      const user = req.user as any;
      const realEstateId = user?.realEstateId || user?.id;
      if (!realEstateId) return res.status(403).json({ error: 'Acesso negado.' });

      // Executa a verificação de leads vencidos (Repescagem de 30 min)
      await this.runRepescagemCheck(realEstateId);

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

      // Se trocou o corretor manualmente, reinicia o cronómetro para o novo corretor
      if (brokerId !== undefined && brokerId !== existingLead.brokerId) {
        dataToUpdate.brokerId = brokerId || null;
        dataToUpdate.assignedAt = new Date();
      }

      // Se moveu o card de estágio (ex: de "Novo" para "Atendimento"), trava a repescagem!
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

      // Atualiza campos do Radar apenas se foram enviados no body
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

  // 4. Adicionar um evento ao Histórico (Trava a repescagem e move para 'Atendimento' se estava 'Novo')
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

      // Ao registrar contato (WhatsApp, Ligação, E-mail, etc.), marca como atendido para não cair na repescagem!
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

  // ==========================================
  // 5. CONFIGURAÇÕES DA ROLETA E FILA DA VEZ
  // ==========================================
  async getRouletteSettings(req: Request, res: Response) {
    try {
      const user = req.user as any;
      const realEstateId = user?.realEstateId || user?.id;

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

      // Ordena exatamente na ordem de quem vai receber o próximo Lead
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
      return res.status(500).json({ error: 'Erro ao carregar configurações da roleta.' });
    }
  }

  async updateRouletteSettings(req: Request, res: Response) {
    try {
      const user = req.user as any;
      const realEstateId = user?.realEstateId || user?.id;
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
      return res.status(500).json({ error: 'Erro ao atualizar roleta.' });
    }
  }

  // ==========================================
  // 6. ALGORITMO DE MATCHMAKING (RADAR)
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

      if (!lead.searchTransaction && !lead.searchType && !lead.searchMaxPrice) {
        return res.json([]); 
      }

      const whereClause: any = { 
        realEstateId, 
        isActive: true 
      };
      
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
          score += 20;
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