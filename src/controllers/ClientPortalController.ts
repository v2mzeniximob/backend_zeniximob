// Caminho: src/controllers/ClientPortalController.ts
import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

const prisma = new PrismaClient() as any;

export class ClientPortalController {
  
  // 1. Rota de Login (Inquilino ou Proprietário)
  async login(req: Request, res: Response) {
    try {
      const { document, password, role } = req.body; // role: 'CLIENT' ou 'OWNER'

      if (!document || !password || !role) {
        return res.status(400).json({ error: 'Preencha CPF/CNPJ, Senha e o Tipo de Acesso.' });
      }

      // Remove máscaras do documento
      const cleanDocument = document.replace(/\D/g, '');

      let user;
      if (role === 'OWNER') {
        user = await prisma.owner.findFirst({ where: { cpfOrCnpj: { contains: cleanDocument } } });
      } else {
        user = await prisma.client.findFirst({ where: { document: { contains: cleanDocument } } });
      }

      if (!user || !user.password) {
        return res.status(401).json({ error: 'Credenciais inválidas ou acesso ainda não liberado pela imobiliária.' });
      }

      // Verifica a senha
      const isValid = await bcrypt.compare(password, user.password);
      if (!isValid) return res.status(401).json({ error: 'Senha incorreta.' });

      // Gera o Token JWT para o Cliente
      const token = jwt.sign(
        { id: user.id, role: role, realEstateId: user.realEstateId },
        process.env.JWT_SECRET || 'secret',
        { expiresIn: '7d' } // Cliente fica logado por 7 dias
      );

      return res.json({
        token,
        user: { id: user.id, name: user.name, role: role }
      });
    } catch (error) {
      console.error('Erro no login do portal:', error);
      return res.status(500).json({ error: 'Erro interno ao realizar login.' });
    }
  }

  // 2. Rota para a Imobiliária GERAR A SENHA do Cliente/Proprietário
  async createAccess(req: Request, res: Response) {
    try {
      const { id, role, password } = req.body;
      const hashedPassword = await bcrypt.hash(password, 10);

      if (role === 'OWNER') {
        await prisma.owner.update({ where: { id }, data: { password: hashedPassword } });
      } else {
        await prisma.client.update({ where: { id }, data: { password: hashedPassword } });
      }

      return res.json({ message: 'Acesso gerado com sucesso!' });
    } catch (error) {
      return res.status(500).json({ error: 'Erro ao gerar senha de acesso.' });
    }
  }

  // 3. Buscar Dados do Dashboard do Usuário Logado
  async getDashboard(req: Request, res: Response) {
    try {
      const userId = (req as any).user.id;
      const role = (req as any).user.role;

      if (role === 'CLIENT') {
        // Traz os contratos do Inquilino, junto com boletos e vistorias
        const contracts = await prisma.contract.findMany({
          where: { tenantId: userId },
          include: {
            property: { select: { title: true, address: true, coverImage: true } },
            invoices: { orderBy: { dueDate: 'asc' } },
            inspections: true
          }
        });
        
        // Traz os tickets (manutenções) abertos por ele
        const tickets = await prisma.ticket.findMany({
          where: { clientId: userId },
          orderBy: { createdAt: 'desc' }
        });

        return res.json({ contracts, tickets });

      } else if (role === 'OWNER') {
        // Traz os imóveis do Proprietário, contratos vinculados e financeiro
        const properties = await prisma.property.findMany({
          where: { ownerId: userId },
          include: {
            contracts: {
              include: { invoices: { orderBy: { dueDate: 'desc' }, take: 12 } }
            }
          }
        });
        return res.json({ properties });
      }

      return res.status(403).json({ error: 'Acesso negado.' });
    } catch (error) {
      return res.status(500).json({ error: 'Erro ao buscar dashboard do portal.' });
    }
  }
}