import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient() as any;

export class TenantController {
  
  // 1. LISTAR APENAS INQUILINOS (A Mágica acontece aqui)
  async list(req: Request, res: Response) {
    try {
      const user = req.user as any;
      const realEstateId = user?.realEstateId || user?.id;
      if (!realEstateId) return res.status(403).json({ error: 'Acesso negado.' });

      // Busca APENAS os clientes que são inquilinos (isTenant = true)
      const tenants = await prisma.client.findMany({
        where: { 
          realEstateId, 
          isTenant: true // <-- O filtro inteligente!
        },
        include: {
          contracts: {
            include: {
              property: { select: { title: true, address: true, rentStatus: true } }
            }
          }
        },
        orderBy: { name: 'asc' }
      });

      return res.json(tenants);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao listar inquilinos.' });
    }
  }

  // 2. CRIAR INQUILINO DIRETO (Pela tela antiga)
  async create(req: Request, res: Response) {
    try {
      const user = req.user as any;
      const realEstateId = user?.realEstateId || user?.id;

      const { 
        name, cpf, currentAddress, phone, email, documentUrl, maritalStatus,
        spouseName, spouseCpf, spouseDocUrl, 
        guarantorName, guarantorCpf, guarantorDocUrl 
      } = req.body;

      // Salvamos na tabela unificada 'Client', já forçando isTenant = true
      const tenant = await prisma.client.create({
        data: {
          clientType: 'PF',
          name, document: cpf, street: currentAddress, phone, email, documentUrl, maritalStatus,
          spouseName, spouseCpf, spouseDocUrl,
          guarantorName, guarantorCpf, guarantorDocUrl,
          isTenant: true, // Força a ser inquilino
          realEstateId
        }
      });

      return res.status(201).json(tenant);
    } catch (error) {
      return res.status(500).json({ error: 'Erro ao cadastrar inquilino.' });
    }
  }

  // 3. ATUALIZAR INQUILINO
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

      await prisma.client.updateMany({
        where: { id, realEstateId },
        data: {
          name, document: cpf, street: currentAddress, phone, email, documentUrl, maritalStatus,
          spouseName, spouseCpf, spouseDocUrl,
          guarantorName, guarantorCpf, guarantorDocUrl
        }
      });

      return res.json({ success: true, message: 'Inquilino atualizado.' });
    } catch (error) {
      return res.status(500).json({ error: 'Erro ao atualizar inquilino.' });
    }
  }

  // 4. ATIVAR/DESATIVAR
  async toggleStatus(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const client = await prisma.client.findUnique({ where: { id } });
      if (!client) return res.status(404).json({ error: 'Inquilino não encontrado.' });

      const updated = await prisma.client.update({
        where: { id },
        data: { isActive: !client.isActive }
      });

      return res.json({ success: true, isActive: updated.isActive });
    } catch (error) {
      return res.status(500).json({ error: 'Erro ao alterar status.' });
    }
  }
}