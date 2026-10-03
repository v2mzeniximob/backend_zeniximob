import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient() as any;

export class BrokerController {
  async create(req: Request, res: Response) {
    try {
      const user = req.user as any;
      const realEstateId = user?.realEstateId || user?.id;

      const { name, cpf, creci, phone, email, password, saleCommission, rentCommission } = req.body;
      
      const existingBroker = await prisma.broker.findFirst({
        where: { OR: [{ email }, { cpf }] }
      });
      if (existingBroker) return res.status(400).json({ error: 'E-mail ou CPF já cadastrado.' });

      const hashedPassword = await bcrypt.hash(password, 10);
      
      const broker = await prisma.broker.create({
        data: {
          name, cpf, creci, phone, email, password: hashedPassword,
          saleCommission: saleCommission ? Number(saleCommission) : 0,
          rentCommission: rentCommission ? Number(rentCommission) : 0,
          realEstateId
        }
      });
      return res.status(201).json(broker);
    } catch (error) {
      return res.status(500).json({ error: 'Erro ao cadastrar corretor.' });
    }
  }

  async list(req: Request, res: Response) {
    try {
      const user = req.user as any;
      const realEstateId = user?.realEstateId || user?.id;

      const brokers = await prisma.broker.findMany({
        where: { realEstateId },
        include: {
          clients: { select: { id: true } },
          properties: { select: { id: true } }
        },
        orderBy: { name: 'asc' }
      });
      return res.json(brokers);
    } catch (error) {
      return res.status(500).json({ error: 'Erro ao listar corretores.' });
    }
  }

  async update(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { name, cpf, creci, phone, email, password, saleCommission, rentCommission } = req.body;

      const dataToUpdate: any = { 
        name, cpf, creci, phone, email,
        saleCommission: saleCommission ? Number(saleCommission) : 0,
        rentCommission: rentCommission ? Number(rentCommission) : 0
      };
      if (password) {
        dataToUpdate.password = await bcrypt.hash(password, 10);
      }

      const broker = await prisma.broker.update({
        where: { id },
        data: dataToUpdate
      });
      return res.json(broker);
    } catch (error) {
      return res.status(500).json({ error: 'Erro ao atualizar corretor.' });
    }
  }

  async toggleStatus(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const broker = await prisma.broker.findUnique({ where: { id } });
      const updated = await prisma.broker.update({
        where: { id },
        data: { isActive: !broker.isActive }
      });
      return res.json(updated);
    } catch (error) {
      return res.status(500).json({ error: 'Erro ao alterar status.' });
    }
  }

  // ==========================================
  // NOVO: RELATÓRIO DE COMISSÕES
  // ==========================================
  async getCommissionReport(req: Request, res: Response) {
    try {
      const user = req.user as any;
      const realEstateId = user?.realEstateId || user?.id;

      const { brokerId, startDate, endDate, type } = req.query;

      let whereClause: any = {
        property: { realEstateId: realEstateId } // Garante que o imóvel é desta imobiliária
      };

      if (type && type !== 'Todos') {
        whereClause.type = type;
      }

      if (startDate && endDate) {
        whereClause.startDate = {
          gte: new Date(startDate as string),
          lte: new Date(endDate as string)
        };
      }

      // Se filtrou por corretor, busca contratos onde ele captou o imóvel OU trouxe o cliente
      if (brokerId && brokerId !== 'Todos') {
        whereClause.OR = [
          { tenant: { brokerId: brokerId as string } },
          { property: { brokerId: brokerId as string } }
        ];
      }

      const contracts = await prisma.contract.findMany({
        where: whereClause,
        include: {
          property: { include: { broker: true } },
          tenant: { include: { broker: true } }
        },
        orderBy: { startDate: 'desc' }
      });

      const report = contracts.map((c: any) => {
        // Prioridade: Se pesquisou por um, usa esse. Senão, assume o Corretor do Cliente (Vendedor), ou o do Imóvel (Captador).
        let targetBroker = c.tenant?.broker || c.property?.broker;
        
        if (brokerId && brokerId !== 'Todos') {
          if (c.tenant?.brokerId === brokerId) targetBroker = c.tenant.broker;
          else if (c.property?.brokerId === brokerId) targetBroker = c.property.broker;
        }

        const brokerName = targetBroker?.name || 'Direto com Imobiliária';
        const bSaleComm = targetBroker?.saleCommission || 0;
        const bRentComm = targetBroker?.rentCommission || 0;

        const commissionPercent = c.type === 'Venda' ? bSaleComm : bRentComm;
        const commissionValue = (c.rentValue * commissionPercent) / 100;

        return {
          contractId: c.id,
          date: c.startDate,
          type: c.type,
          propertyTitle: c.property?.title || 'Imóvel Excluído',
          clientName: c.tenant?.name || 'Cliente Excluído',
          brokerName: brokerName,
          operationValue: c.rentValue,
          commissionPercent: commissionPercent,
          commissionValue: commissionValue,
          status: c.status
        };
      });

      return res.json(report);
    } catch (error) {
      console.error('Erro ao gerar relatório:', error);
      return res.status(500).json({ error: 'Erro ao gerar relatório.' });
    }
  }
}