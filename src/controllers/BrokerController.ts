import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient() as any;

export class BrokerController {
  
  // 1. CRIAR CORRETOR / GERENTE / CAPTADOR (Com suporte a profileImageUrl)
  async create(req: Request, res: Response) {
    try {
      const user = req.user as any;
      const realEstateId = user?.realEstateId || user?.id;

      const { 
        name, cpf, cnpj, creci, phone, email, password, 
        role, saleCommission, rentCommission, 
        captureCommission, managerCommission, inRoulette, taxRuleId,
        profileImageUrl, avatarUrl 
      } = req.body;
      
      const existingBroker = await prisma.broker.findFirst({
        where: { OR: [{ email }, { cpf }] }
      });
      if (existingBroker) return res.status(400).json({ error: 'E-mail ou CPF já cadastrado.' });

      const hashedPassword = await bcrypt.hash(password, 10);
      
      const broker = await prisma.broker.create({
        data: {
          name,
          cpf,
          cnpj: cnpj || null,
          creci,
          phone,
          email,
          password: hashedPassword,
          role: role || 'Corretor', // "Corretor", "Captador", "Gerente"
          saleCommission: saleCommission ? Number(saleCommission) : 0,
          rentCommission: rentCommission ? Number(rentCommission) : 0,
          captureCommission: captureCommission !== undefined ? Number(captureCommission) : 10,
          managerCommission: managerCommission !== undefined ? Number(managerCommission) : 5,
          inRoulette: inRoulette !== undefined ? Boolean(inRoulette) : true,
          taxRuleId: taxRuleId || null,
          profileImageUrl: profileImageUrl || avatarUrl || null, // <--- SALVA A FOTO NO CAMPO CORRETO DO PRISMA
          realEstateId
        }
      });
      return res.status(201).json(broker);
    } catch (error) {
      console.error('Erro ao cadastrar corretor:', error);
      return res.status(500).json({ error: 'Erro ao cadastrar corretor.' });
    }
  }

  // 2. LISTAR EQUIPE
  async list(req: Request, res: Response) {
    try {
      const user = req.user as any;
      const realEstateId = user?.realEstateId || user?.id;

      const brokers = await prisma.broker.findMany({
        where: { realEstateId },
        include: {
          taxRule: true,
          clients: { select: { id: true } },
          properties: { select: { id: true } },
          capturedProperties: { select: { id: true } }
        },
        orderBy: { name: 'asc' }
      });
      return res.json(brokers);
    } catch (error) {
      return res.status(500).json({ error: 'Erro ao listar corretores.' });
    }
  }

  // 3. ATUALIZAR CORRETOR (Com suporte a profileImageUrl)
  async update(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { 
        name, cpf, cnpj, creci, phone, email, password, 
        role, saleCommission, rentCommission, 
        captureCommission, managerCommission, inRoulette, taxRuleId,
        profileImageUrl, avatarUrl 
      } = req.body;

      const dataToUpdate: any = { 
        name,
        cpf,
        cnpj: cnpj || null,
        creci,
        phone,
        email,
        role: role || 'Corretor',
        saleCommission: saleCommission ? Number(saleCommission) : 0,
        rentCommission: rentCommission ? Number(rentCommission) : 0,
        captureCommission: captureCommission !== undefined ? Number(captureCommission) : 10,
        managerCommission: managerCommission !== undefined ? Number(managerCommission) : 5,
        inRoulette: inRoulette !== undefined ? Boolean(inRoulette) : true,
        taxRuleId: taxRuleId || null,
        profileImageUrl: (profileImageUrl !== undefined || avatarUrl !== undefined) ? (profileImageUrl || avatarUrl || null) : undefined
      };

      if (password) {
        dataToUpdate.password = await bcrypt.hash(password, 10);
      }

      const broker = await prisma.broker.update({
        where: { id },
        data: dataToUpdate,
        include: { taxRule: true }
      });
      return res.json(broker);
    } catch (error) {
      console.error('Erro ao atualizar corretor:', error);
      return res.status(500).json({ error: 'Erro ao atualizar corretor.' });
    }
  }

  // 4. ATIVAR / DESATIVAR CORRETOR
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

  // 5. ENTRAR / SAIR DA FILA DA ROLETA DE LEADS
  async toggleRoulette(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const broker = await prisma.broker.findUnique({ where: { id } });
      const updated = await prisma.broker.update({
        where: { id },
        data: { inRoulette: !broker.inRoulette }
      });
      return res.json(updated);
    } catch (error) {
      return res.status(500).json({ error: 'Erro ao alterar status na roleta.' });
    }
  }

  // 6. BUSCAR REGRAS DE RATEIO (SPLIT) DA IMOBILIÁRIA
  async getSplitSettings(req: Request, res: Response) {
    try {
      const user = req.user as any;
      const realEstateId = user?.realEstateId || user?.id;

      const store = await prisma.realEstate.findUnique({
        where: { id: realEstateId },
        select: {
          agencySplitPercent: true,
          sellerSplitPercent: true,
          captatorSplitPercent: true,
          managerSplitPercent: true,
          rouletteEnabled: true,
          rouletteTimeoutMinutes: true
        }
      });

      return res.json(store || {
        agencySplitPercent: 50,
        sellerSplitPercent: 35,
        captatorSplitPercent: 10,
        managerSplitPercent: 5,
        rouletteEnabled: false,
        rouletteTimeoutMinutes: 30
      });
    } catch (error) {
      return res.status(500).json({ error: 'Erro ao buscar regras de rateio.' });
    }
  }

  // 7. SALVAR REGRAS DE RATEIO (SPLIT) DA IMOBILIÁRIA
  async updateSplitSettings(req: Request, res: Response) {
    try {
      const user = req.user as any;
      const realEstateId = user?.realEstateId || user?.id;

      const { 
        agencySplitPercent, sellerSplitPercent, 
        captatorSplitPercent, managerSplitPercent 
      } = req.body;

      const updated = await prisma.realEstate.update({
        where: { id: realEstateId },
        data: {
          agencySplitPercent: Number(agencySplitPercent),
          sellerSplitPercent: Number(sellerSplitPercent),
          captatorSplitPercent: Number(captatorSplitPercent),
          managerSplitPercent: Number(managerSplitPercent)
        }
      });

      return res.json(updated);
    } catch (error) {
      return res.status(500).json({ error: 'Erro ao salvar regras de rateio.' });
    }
  }

  // ==============================================================
  // 8. RELATÓRIO DE COMISSÕES COM RATEIO AUTOMÁTICO (SPLIT)
  // ==============================================================
  async getCommissionReport(req: Request, res: Response) {
    try {
      const user = req.user as any;
      const realEstateId = user?.realEstateId || user?.id;

      const { brokerId, startDate, endDate, type } = req.query;

      const [store, managerBroker] = await Promise.all([
        prisma.realEstate.findUnique({ where: { id: realEstateId } }),
        prisma.broker.findFirst({ where: { realEstateId, role: 'Gerente', isActive: true } })
      ]);

      const splitRules = {
        agency: store?.agencySplitPercent ?? 50,
        seller: store?.sellerSplitPercent ?? 35,
        captator: store?.captatorSplitPercent ?? 10,
        manager: store?.managerSplitPercent ?? 5
      };

      const whereClause: any = {
        property: { realEstateId: realEstateId }
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

      const contracts = await prisma.contract.findMany({
        where: whereClause,
        include: {
          property: { include: { broker: true, captator: true } },
          tenant: { include: { broker: true } }
        },
        orderBy: { startDate: 'desc' }
      });

      const fullReport = contracts.map((c: any) => {
        const sellerBroker = c.tenant?.broker || c.property?.broker || null;
        const captatorBroker = c.property?.captator || c.property?.broker || null;

        const fallbackPercent = c.type === 'Venda' 
          ? (sellerBroker?.saleCommission || 6) 
          : (sellerBroker?.rentCommission || 100);
        
        const grossCommissionPercent = c.adminFeePercent && c.adminFeePercent > 0 
          ? c.adminFeePercent 
          : fallbackPercent;

        const grossCommissionValue = (c.rentValue * grossCommissionPercent) / 100;

        const sellerAmount = sellerBroker ? (grossCommissionValue * splitRules.seller) / 100 : 0;
        const captatorAmount = captatorBroker ? (grossCommissionValue * splitRules.captator) / 100 : 0;
        const managerAmount = managerBroker ? (grossCommissionValue * splitRules.manager) / 100 : 0;
        
        const agencyAmount = grossCommissionValue - (sellerAmount + captatorAmount + managerAmount);

        let filteredBrokerShare = 0;
        let filteredBrokerRoles: string[] = [];

        if (brokerId && brokerId !== 'Todos') {
          if (sellerBroker?.id === brokerId) {
            filteredBrokerShare += sellerAmount;
            filteredBrokerRoles.push(`Vendedor (${splitRules.seller}%)`);
          }
          if (captatorBroker?.id === brokerId) {
            filteredBrokerShare += captatorAmount;
            filteredBrokerRoles.push(`Captador (${splitRules.captator}%)`);
          }
          if (managerBroker?.id === brokerId) {
            filteredBrokerShare += managerAmount;
            filteredBrokerRoles.push(`Gerente (${splitRules.manager}%)`);
          }
        }

        return {
          contractId: c.id,
          date: c.startDate,
          type: c.type,
          propertyTitle: c.property?.title || 'Imóvel Excluído',
          clientName: c.tenant?.name || 'Cliente Excluído',
          operationValue: c.rentValue,
          commissionPercent: grossCommissionPercent,
          commissionValue: grossCommissionValue,
          status: c.status,

          sellerName: sellerBroker?.name || 'Direto Loja',
          sellerId: sellerBroker?.id || null,
          sellerPercent: sellerBroker ? splitRules.seller : 0,
          sellerAmount,

          captatorName: captatorBroker?.name || 'Direto Loja',
          captatorId: captatorBroker?.id || null,
          captatorPercent: captatorBroker ? splitRules.captator : 0,
          captatorAmount,

          managerName: managerBroker?.name || 'Sem Gerente',
          managerId: managerBroker?.id || null,
          managerPercent: managerBroker ? splitRules.manager : 0,
          managerAmount,

          agencyAmount,

          filteredBrokerShare,
          filteredBrokerRoleText: filteredBrokerRoles.join(' + ')
        };
      });

      const finalReport = (brokerId && brokerId !== 'Todos')
        ? fullReport.filter((item: any) => item.filteredBrokerShare > 0)
        : fullReport;

      return res.json(finalReport);
    } catch (error) {
      console.error('Erro ao gerar relatório de split:', error);
      return res.status(500).json({ error: 'Erro ao gerar relatório.' });
    }
  }
}