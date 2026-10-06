import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

// O "as any" protege-nos contra atrasos de tipagem do TypeScript
const prisma = new PrismaClient() as any;

export class MasterContractController {
  
  // 1. CRIAR CONTRATO E GERAR AS FATURAS RECORRENTES
  async create(req: Request, res: Response) {
    try {
      const { type, franchiseeId, realEstateId, startDate, endDate, value, documentUrl } = req.body;

      // Validações básicas
      if (!type) return res.status(400).json({ error: 'Tipo de contrato é obrigatório.' });
      if (!startDate || !value) return res.status(400).json({ error: 'Data de início e valor são obrigatórios.' });

      // Cria o contrato na tabela do Master
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

      // 2. GERAR AS FATURAS DO MASTER (INVOICES)
      const start = new Date(startDate);
      // Se não houver data de fim, gera apenas 1 fatura (Setup/Mensal avulso). 
      // Se houver, gera faturas para todos os meses até o fim.
      const end = endDate ? new Date(endDate) : new Date(startDate); 
      const val = Number(value);

      if (start <= end && !isNaN(val)) {
        let currentMonth = new Date(start);
        
        while (currentMonth <= end) {
          await prisma.masterInvoice.create({
            data: {
              masterContractId: contract.id,
              amount: val,
              dueDate: new Date(currentMonth),
              status: 'Pendente',
              description: `Assinatura SaaS - ${type.replace(/_/g, ' x ')}`
            }
          });
          currentMonth.setMonth(currentMonth.getMonth() + 1);
        }
      }

      return res.status(201).json(contract);
    } catch (error) {
      console.error("Erro ao gerar contrato Master:", error);
      return res.status(500).json({ error: 'Erro ao gerar contrato SaaS e faturas.' });
    }
  }

  // 3. LISTAR CONTRATOS DO MASTER
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

  // 4. DELETAR CONTRATO
  async delete(req: Request, res: Response) {
    try {
      const { id } = req.params;
      
      // Apaga as faturas primeiro (Cascata manual por segurança)
      await prisma.masterInvoice.deleteMany({ where: { masterContractId: id } });
      await prisma.masterContract.delete({ where: { id } });
      
      return res.json({ message: 'Contrato e faturas excluídos com sucesso.' });
    } catch (error) {
      return res.status(500).json({ error: 'Erro ao excluir contrato.' });
    }
  }
}