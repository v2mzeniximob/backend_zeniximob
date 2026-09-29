import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export class DashboardController {
  
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
}