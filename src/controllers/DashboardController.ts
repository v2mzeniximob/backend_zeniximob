import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export class DashboardController {
  
  // ==========================================
  // 1. DASHBOARD MASTER (DONO DO SAAS / FRANQUIAS)
  // ==========================================
  async getMasterStats(req: Request, res: Response): Promise<any> {
    try {
      // 1. Contagens Gerais
      const totalFranchisees = await prisma.franchisee.count();
      const totalRealEstates = await prisma.realEstate.count();
      const activePlans = await prisma.plan.count({ where: { isActive: true } });

      // 2. Cálculo de Faturamento Mensal Estimado (Baseado nos planos das imobiliárias ativas)
      const activeRealEstates = await prisma.realEstate.findMany({
        where: { isActive: true },
        include: { plan: true }
      });

      // Soma o valor do plano de cada imobiliária ativa
      const estimatedRevenue = activeRealEstates.reduce((acc, estate) => {
        return acc + Number(estate.plan.price);
      }, 0);

      // 3. Últimas 5 imobiliárias cadastradas (Para mostrar numa tabela rápida na tela inicial)
      const recentRealEstates = await prisma.realEstate.findMany({
        take: 5,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          tradeName: true,
          createdAt: true,
          plan: { select: { name: true } },
          franchisee: { select: { tradeName: true } }
        }
      });

      // Retorna o pacotão de dados para o Frontend montar a tela
      return res.json({
        metrics: {
          totalFranchisees,
          totalRealEstates,
          activePlans,
          estimatedRevenue: estimatedRevenue.toFixed(2) // Formata com 2 casas decimais
        },
        recentRealEstates
      });

    } catch (error) {
      console.error('Erro ao gerar estatísticas:', error);
      return res.status(500).json({ error: 'Erro interno ao carregar o dashboard.' });
    }
  }

  // ==========================================
  // 2. DASHBOARD DA IMOBILIÁRIA (INQUILINO DO SISTEMA)
  // ==========================================
  async getRealEstateMetrics(req: Request, res: Response): Promise<any> {
    try {
      const user = req.user as any;
      const realEstateId = user?.realEstateId || user?.id;
      if (!realEstateId) return res.status(403).json({ error: 'Acesso negado.' });

      // 1. Métricas de Imóveis (Taxa de Vacância)
      const properties = await (prisma as any).property.findMany({
        where: { realEstateId, isActive: true },
        select: { rentStatus: true }
      });
      const totalProperties = properties.length;
      const rentedProperties = properties.filter((p: any) => p.rentStatus === 'Alugado').length;
      const vacantProperties = totalProperties - rentedProperties;

      // 2. Métricas Financeiras e de Contratos Ativos
      const activeContracts = await (prisma as any).contract.findMany({
        where: { property: { realEstateId }, status: 'Ativo' },
        select: { rentValue: true, adminFeePercent: true }
      });
      const totalActiveContracts = activeContracts.length;
      
      // Volume Total Movimentado (Soma de todos os aluguéis)
      const totalRentVolume = activeContracts.reduce((acc: number, c: any) => acc + Number(c.rentValue), 0);
      
      // Receita Líquida da Imobiliária (Soma da % de taxa de administração de cada contrato)
      const estimatedAgencyRevenue = activeContracts.reduce((acc: number, c: any) => {
        return acc + (Number(c.rentValue) * (Number(c.adminFeePercent) / 100));
      }, 0);

      // 3. Métricas do CRM (Leads)
      const leads = await (prisma as any).lead.findMany({
        where: { realEstateId },
        select: { stage: true }
      });
      const leadsByStage = leads.reduce((acc: any, lead: any) => {
        acc[lead.stage] = (acc[lead.stage] || 0) + 1;
        return acc;
      }, {});

      // Retorna o pacote formatado para os gráficos da imobiliária
      return res.json({
        properties: { total: totalProperties, rented: rentedProperties, vacant: vacantProperties },
        contracts: { totalActive: totalActiveContracts, totalVolume: totalRentVolume, expectedRevenue: estimatedAgencyRevenue },
        leads: { total: leads.length, byStage: leadsByStage }
      });

    } catch (error) {
      console.error('Erro ao gerar métricas da imobiliária:', error);
      return res.status(500).json({ error: 'Erro interno ao carregar o dashboard da imobiliária.' });
    }
  }
}