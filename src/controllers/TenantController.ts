import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export class TenantController {
  async create(req: Request, res: Response) {
    try {
      const user = req.user as any;
      const realEstateId = user?.realEstateId || user?.id;
      if (!realEstateId) return res.status(403).json({ error: 'Acesso negado.' });

      const { 
        name, cpf, currentAddress, phone, email, documentUrl, maritalStatus,
        spouseName, spouseCpf, spouseDocUrl, 
        guarantorName, guarantorCpf, guarantorDocUrl 
      } = req.body;

      const tenantExists = await (prisma as any).tenant.findUnique({ where: { cpf } });
      if (tenantExists) {
        return res.status(400).json({ error: 'Já existe um inquilino com este CPF.' });
      }

      const tenant = await (prisma as any).tenant.create({
        data: {
          name, cpf, currentAddress, phone, email, documentUrl, maritalStatus,
          spouseName, spouseCpf, spouseDocUrl,
          guarantorName, guarantorCpf, guarantorDocUrl,
          realEstateId
        }
      });

      return res.status(201).json(tenant);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao cadastrar inquilino.' });
    }
  }

  async list(req: Request, res: Response) {
    try {
      const user = req.user as any;
      const realEstateId = user?.realEstateId || user?.id;
      if (!realEstateId) return res.status(403).json({ error: 'Acesso negado.' });

      const tenants = await (prisma as any).tenant.findMany({
        where: { realEstateId },
        orderBy: { name: 'asc' }
      });

      return res.json(tenants);
    } catch (error) {
      return res.status(500).json({ error: 'Erro ao listar inquilinos.' });
    }
  }

  async update(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const user = req.user as any;
      const realEstateId = user?.realEstateId || user?.id;
      
      const { 
        name, cpf, currentAddress, phone, email, documentUrl, maritalStatus,
        spouseName, spouseCpf, spouseDocUrl, 
        guarantorName, guarantorCpf, guarantorDocUrl 
      } = req.body;

      await (prisma as any).tenant.updateMany({
        where: { id, realEstateId },
        data: {
          name, cpf, currentAddress, phone, email, documentUrl, maritalStatus,
          spouseName, spouseCpf, spouseDocUrl,
          guarantorName, guarantorCpf, guarantorDocUrl
        }
      });

      return res.json({ success: true, message: 'Inquilino atualizado com sucesso.' });
    } catch (error) {
      return res.status(500).json({ error: 'Erro ao atualizar inquilino.' });
    }
  }

  async toggleStatus(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const user = req.user as any;
      const realEstateId = user?.realEstateId || user?.id;

      const tenant = await (prisma as any).tenant.findFirst({ where: { id, realEstateId } });
      if (!tenant) return res.status(404).json({ error: 'Inquilino não encontrado.' });

      await (prisma as any).tenant.update({
        where: { id },
        data: { isActive: !tenant.isActive }
      });

      return res.json({ success: true, isActive: !tenant.isActive });
    } catch (error) {
      return res.status(500).json({ error: 'Erro ao alterar status do inquilino.' });
    }
  }
}