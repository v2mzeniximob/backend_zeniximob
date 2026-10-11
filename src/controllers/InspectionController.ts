import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient() as any;

export class InspectionController {

  // 1. CRIAR NOVA VISTORIA (Manual ou Digital)
  async create(req: Request, res: Response) {
    try {
      // O frontend faz POST para /contracts/:contractId/inspections
      const { contractId } = req.params;
      const { type, date, reportUrl } = req.body;

      if (!contractId) {
        return res.status(400).json({ error: 'O ID do contrato é obrigatório.' });
      }

      const inspection = await prisma.inspection.create({
        data: {
          contractId,
          type: type || 'Rotina',
          date: date ? new Date(date) : new Date(),
          reportUrl: reportUrl || ''
        }
      });

      return res.status(201).json(inspection);
    } catch (error) {
      console.error('Erro ao criar vistoria:', error);
      return res.status(500).json({ error: 'Erro ao adicionar vistoria.' });
    }
  }

  // 2. ATUALIZAR VISTORIA EXISTENTE (Editar / Colocar link do Drive)
  async update(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { type, date, reportUrl } = req.body;

      const inspection = await prisma.inspection.update({
        where: { id },
        data: {
          type,
          date: date ? new Date(date) : undefined,
          reportUrl
        }
      });

      return res.json(inspection);
    } catch (error) {
      console.error('Erro ao atualizar vistoria:', error);
      return res.status(500).json({ error: 'Erro ao atualizar vistoria.' });
    }
  }

  // 3. EXCLUIR VISTORIA
  async delete(req: Request, res: Response) {
    try {
      const { id } = req.params;

      await prisma.inspection.delete({
        where: { id }
      });

      return res.json({ message: 'Vistoria excluída com sucesso.' });
    } catch (error) {
      console.error('Erro ao excluir vistoria:', error);
      return res.status(500).json({ error: 'Erro ao excluir vistoria.' });
    }
  }

  // (Opcional) 4. LISTAR TODAS AS VISTORIAS DE UM CONTRATO ESPECÍFICO
  async listByContract(req: Request, res: Response) {
    try {
      const { contractId } = req.params;

      const inspections = await prisma.inspection.findMany({
        where: { contractId },
        orderBy: { date: 'desc' }
      });

      return res.json(inspections);
    } catch (error) {
      return res.status(500).json({ error: 'Erro ao listar vistorias.' });
    }
  }
}