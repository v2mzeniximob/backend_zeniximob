import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export class PlanController {
  
  // 1. CRIAR NOVO PLANO
  async create(req: Request, res: Response): Promise<any> {
    try {
      const { name, price, modules, hasSupport, supportPrice } = req.body;

      // Validação básica
      if (!name || price === undefined) {
        return res.status(400).json({ error: 'Nome e valor do plano são obrigatórios.' });
      }

      const plan = await prisma.plan.create({
        data: {
          name,
          price,
          modules: modules || [], // Ex: ["CRM", "FINANCEIRO", "SITE"]
          hasSupport: hasSupport || false,
          supportPrice: hasSupport ? supportPrice : null, // Só salva valor se tiver suporte
        },
      });

      return res.status(201).json(plan);
    } catch (error) {
      console.error('Erro ao criar plano:', error);
      return res.status(500).json({ error: 'Erro interno ao criar o plano.' });
    }
  }

  // 2. LISTAR TODOS OS PLANOS
  async list(req: Request, res: Response): Promise<any> {
    try {
      const plans = await prisma.plan.findMany({
        orderBy: { createdAt: 'desc' } // Mostra os mais recentes primeiro
      });
      return res.json(plans);
    } catch (error) {
      console.error('Erro ao listar planos:', error);
      return res.status(500).json({ error: 'Erro interno ao buscar planos.' });
    }
  }

// 3. EDITAR UM PLANO
  async update(req: Request, res: Response): Promise<any> {
    try {
      const id = req.params.id as string; // Correção aqui
      const { name, price, modules, hasSupport, supportPrice } = req.body;

      const planExists = await prisma.plan.findUnique({ where: { id } });
      if (!planExists) {
        return res.status(404).json({ error: 'Plano não encontrado.' });
      }

      const updatedPlan = await prisma.plan.update({
        where: { id },
        data: {
          name,
          price,
          modules,
          hasSupport,
          supportPrice: hasSupport ? supportPrice : null,
        },
      });

      return res.json(updatedPlan);
    } catch (error) {
      console.error('Erro ao atualizar plano:', error);
      return res.status(500).json({ error: 'Erro interno ao atualizar o plano.' });
    }
  }

  // 4. ATIVAR / INATIVAR PLANO
  async toggleStatus(req: Request, res: Response): Promise<any> {
    try {
      const id = req.params.id as string; // Correção aqui

      const plan = await prisma.plan.findUnique({ where: { id } });
      if (!plan) {
        return res.status(404).json({ error: 'Plano não encontrado.' });
      }

      const updatedPlan = await prisma.plan.update({
        where: { id },
        data: { isActive: !plan.isActive },
      });

      return res.json({ 
        message: `Plano ${updatedPlan.isActive ? 'ativado' : 'inativado'} com sucesso!`,
        plan: updatedPlan 
      });
    } catch (error) {
      console.error('Erro ao alterar status do plano:', error);
      return res.status(500).json({ error: 'Erro interno ao alterar status.' });
    }
  }
}