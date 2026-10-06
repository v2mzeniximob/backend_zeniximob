import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient() as any;

export class MasterContractController {
  
  async create(req: Request, res: Response) {
    try {
      const { type, franchiseeId, realEstateId, planId, startDate, endDate, value, documentUrl } = req.body;

      if (!type) return res.status(400).json({ error: 'Tipo de contrato é obrigatório.' });
      if (!startDate || !value) return res.status(400).json({ error: 'Data de início e valor são obrigatórios.' });

      // 1. Cria o contrato
      const contract = await prisma.masterContract.create({
        data: {
          type,
          franchiseeId: franchiseeId || null,
          realEstateId: realEstateId || null,
          startDate: new Date(startDate),
          endDate: endDate ? new Date(endDate) : null,
          value: Number(value),
          documentUrl
        }
      });

      // 2. Se um Plano foi selecionado e for contrato de Imobiliária, atualiza a Imobiliária
      if (planId && realEstateId && type === 'MASTER_IMOBILIARIA') {
        await prisma.realEstate.update({
          where: { id: realEstateId },
          data: { planId }
        });
      }

      // 3. GERAR AS FATURAS RECORRENTES (LOOP DE DATAS)
      // Ajustamos para UTC para evitar problemas de fuso horário pulando dias
      const start = new Date(startDate);
      start.setUTCHours(12, 0, 0, 0); 
      
      const endLimit = endDate ? new Date(endDate) : new Date(startDate);
      endLimit.setUTCHours(12, 0, 0, 0);

      const val = Number(value);

      if (start <= endLimit && !isNaN(val)) {
        let currentMonth = new Date(start);
        let count = 1;
        
        while (currentMonth <= endLimit) {
          await prisma.masterInvoice.create({
            data: {
              masterContractId: contract.id,
              amount: val,
              dueDate: new Date(currentMonth),
              status: 'Pendente',
              description: `Mensalidade SaaS - Parcela ${count}`
            }
          });
          // Avança exatamente 1 mês
          currentMonth.setUTCMonth(currentMonth.getUTCMonth() + 1);
          count++;
        }
      }

      return res.status(201).json(contract);
    } catch (error) {
      console.error("Erro ao gerar contrato Master:", error);
      return res.status(500).json({ error: 'Erro ao gerar contrato SaaS e faturas.' });
    }
  }

  // ATUALIZAR CONTRATO (ANEXAR DOCUMENTO)
  async update(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { documentUrl } = req.body;

      const contract = await prisma.masterContract.update({
        where: { id },
        data: { 
          documentUrl,
          // Se anexou o documento, muda automaticamente o status para Assinado
          status: documentUrl ? 'Assinado' : 'Ativo' 
        }
      });

      return res.json(contract);
    } catch (error) {
      console.error("Erro ao atualizar contrato:", error);
      return res.status(500).json({ error: 'Erro ao atualizar o contrato.' });
    }
  }

  async list(req: Request, res: Response) {
    try {
      const contracts = await prisma.masterContract.findMany({
        include: {
          franchisee: { select: { corporateName: true, tradeName: true, cnpj: true } },
          realEstate: { select: { corporateName: true, tradeName: true, cnpj: true } },
          invoices: { orderBy: { dueDate: 'asc' } }
        },
        orderBy: { createdAt: 'desc' }
      });
      return res.json(contracts);
    } catch (error) {
      return res.status(500).json({ error: 'Erro ao listar contratos.' });
    }
  }

  async delete(req: Request, res: Response) {
    try {
      const { id } = req.params;
      await prisma.masterInvoice.deleteMany({ where: { masterContractId: id } });
      await prisma.masterContract.delete({ where: { id } });
      return res.json({ message: 'Contrato e faturas excluídos com sucesso.' });
    } catch (error) {
      return res.status(500).json({ error: 'Erro ao excluir contrato.' });
    }
  }
}