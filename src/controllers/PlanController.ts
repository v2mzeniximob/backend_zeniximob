import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient() as any;

export class PlanController {
  
  async create(req: Request, res: Response) {
    try {
      const { name, price, modules, hasSupport, supportPrice, isActive } = req.body;

      const plan = await prisma.plan.create({
        data: {
          name,
          price: Number(price),
          modules: Array.isArray(modules) ? modules : [], // Garante que é um array para o JSON
          hasSupport: Boolean(hasSupport),
          supportPrice: supportPrice ? Number(supportPrice) : null,
          isActive: isActive !== undefined ? Boolean(isActive) : true
        }
      });

      return res.status(201).json(plan);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao criar plano.' });
    }
  }

  async list(req: Request, res: Response) {
    try {
      const plans = await prisma.plan.findMany({
        orderBy: { price: 'asc' },
        include: {
          _count: {
            select: { realEstates: true } // Traz quantas imobiliárias assinam este plano
          }
        }
      });
      return res.json(plans);
    } catch (error) {
      return res.status(500).json({ error: 'Erro ao listar planos.' });
    }
  }

  async update(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { name, price, modules, hasSupport, supportPrice, isActive } = req.body;

      const plan = await prisma.plan.update({
        where: { id },
        data: {
          name,
          price: Number(price),
          modules: Array.isArray(modules) ? modules : [],
          hasSupport: Boolean(hasSupport),
          supportPrice: supportPrice ? Number(supportPrice) : null,
          isActive: isActive !== undefined ? Boolean(isActive) : true
        }
      });

      return res.json(plan);
    } catch (error) {
      return res.status(500).json({ error: 'Erro ao atualizar plano.' });
    }
  }

  // ATIVAR / DESATIVAR PLANO RAPIDAMENTE
  async toggleStatus(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { isActive } = req.body;

      const plan = await prisma.plan.update({
        where: { id },
        data: { isActive: Boolean(isActive) }
      });

      return res.json(plan);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao alterar status do plano.' });
    }
  }

  async delete(req: Request, res: Response) {
    try {
      const { id } = req.params;
      
      // Verifica se existem imobiliárias usando este plano antes de excluir
      const inUse = await prisma.realEstate.count({ where: { planId: id } });
      if (inUse > 0) {
        return res.status(400).json({ error: 'Não é possível excluir um plano que possui imobiliárias ativas.' });
      }

      await prisma.plan.delete({ where: { id } });
      return res.json({ message: 'Plano excluído com sucesso.' });
    } catch (error) {
      return res.status(500).json({ error: 'Erro ao excluir plano.' });
    }
  }
}