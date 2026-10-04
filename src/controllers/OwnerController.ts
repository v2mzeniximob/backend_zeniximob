import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

const prisma = new PrismaClient() as any;

export class OwnerController {
  
  // ==========================================
  // LOGIN NO PORTAL DO CLIENTE (PROPRIETÁRIO)
  // ==========================================
  async portalLogin(req: Request, res: Response) {
    try {
      const { cpfOrCnpj, password, slug } = req.body;

      // 1. Valida se enviou os dados
      if (!cpfOrCnpj || !password || !slug) {
        return res.status(400).json({ error: 'CPF/CNPJ, senha e slug da imobiliária são obrigatórios.' });
      }

      // 2. Limpa a máscara do CPF/CNPJ (caso o front envie com pontos e traços)
      const cleanCpfCnpj = cpfOrCnpj.replace(/\D/g, '');

      // 3. Busca a imobiliária pelo slug
      const realEstate = await prisma.realEstate.findUnique({
        where: { slug }
      });

      if (!realEstate) {
        return res.status(404).json({ error: 'Imobiliária não encontrada.' });
      }

      // 4. Busca o proprietário vinculado a essa imobiliária específica
      // O 'OR' garante que vai achar mesmo se no banco estiver salvo com ou sem máscara
      const owner = await prisma.owner.findFirst({
        where: {
          realEstateId: realEstate.id,
          OR: [
            { cpfOrCnpj: cpfOrCnpj },      // Busca exata (com máscara)
            { cpfOrCnpj: cleanCpfCnpj }    // Busca apenas números (sem máscara)
          ],
          isActive: true // Evita login de proprietários inativados
        }
      });

      if (!owner) {
        return res.status(404).json({ error: 'Usuário não encontrado nesta imobiliária.' });
      }

      // 5. Verifica se tem senha cadastrada
      if (!owner.password) {
        return res.status(401).json({ error: 'Nenhuma senha cadastrada para este usuário.' });
      }

      // 6. Compara a senha enviada com a senha criptografada do banco
      const isValidPassword = await bcrypt.compare(password, owner.password);

      if (!isValidPassword) {
        return res.status(401).json({ error: 'Credenciais inválidas.' });
      }

      // 7. Gera o Token de autenticação (Ajuste o secret conforme seu .env)
      const token = jwt.sign(
        { id: owner.id, role: 'PROPRIETARIO', realEstateId: realEstate.id },
        process.env.JWT_SECRET || 'super_secret_key',
        { expiresIn: '1d' }
      );

      // Remove a senha do objeto antes de enviar para o frontend
      const { password: _, ...ownerData } = owner;

      return res.json({
        user: ownerData,
        token
      });

    } catch (error) {
      console.error('Erro no login do portal (Proprietário):', error);
      return res.status(500).json({ error: 'Erro interno ao realizar login.' });
    }
  }

  // 1. CRIAR PROPRIETÁRIO
  async create(req: Request, res: Response) {
    try {
      const user = req.user as any;
      const realEstateId = user?.realEstateId || user?.id;
      if (!realEstateId) return res.status(403).json({ error: 'Acesso negado.' });

      const { name, cpfOrCnpj, email, phone, bankData, inspectionUrl, password } = req.body;
      
      // Encripta a senha se for enviada
      const hashedPassword = password ? await bcrypt.hash(password, 10) : null;

      const owner = await prisma.owner.create({ 
        data: { 
          name, cpfOrCnpj, email, phone, bankData, inspectionUrl, realEstateId,
          password: hashedPassword
        } 
      });
      
      return res.status(201).json(owner);
    } catch (error) { 
      console.error('Erro ao cadastrar proprietário:', error);
      return res.status(500).json({ error: 'Erro ao cadastrar proprietário.' }); 
    }
  }

  // 2. LISTAR PROPRIETÁRIOS
  async list(req: Request, res: Response) {
    try {
      const user = req.user as any;
      const realEstateId = user?.realEstateId || user?.id;
      
      const owners = await prisma.owner.findMany({
        where: { realEstateId }, 
        include: { properties: { select: { id: true, title: true } } }, 
        orderBy: { name: 'asc' }
      });
      return res.json(owners);
    } catch (error) { 
      console.error('Erro ao listar proprietários:', error);
      return res.status(500).json({ error: 'Erro ao listar proprietários.' }); 
    }
  }

  // 3. ATUALIZAR PROPRIETÁRIO
  async update(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { name, cpfOrCnpj, email, phone, bankData, managementContractUrl, inspectionUrl, password } = req.body;
      const user = req.user as any;
      const realEstateId = user?.realEstateId || user?.id;

      // Garante que o proprietário existe e pertence à imobiliária logada
      const owner = await prisma.owner.findFirst({
        where: { id, realEstateId }
      });

      if (!owner) {
        return res.status(404).json({ error: 'Proprietário não encontrado ou sem permissão.' });
      }

      const dataToUpdate: any = {
        name,
        cpfOrCnpj,
        email,
        phone,
        bankData,
        inspectionUrl,
        managementContractUrl: managementContractUrl !== undefined ? managementContractUrl : undefined
      };

      // Se enviou uma senha na atualização, encripta e salva
      if (password) {
        dataToUpdate.password = await bcrypt.hash(password, 10);
      }

      const updated = await prisma.owner.update({
        where: { id },
        data: dataToUpdate
      });

      return res.json(updated);
    } catch (error) {
      console.error('Erro ao atualizar proprietário:', error);
      return res.status(500).json({ error: 'Erro ao atualizar proprietário.' });
    }
  }

  // 4. ATIVAR / DESATIVAR PROPRIETÁRIO
  async toggleStatus(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const owner = await prisma.owner.findUnique({ where: { id } });
      
      if(!owner) return res.status(404).json({ error: 'Proprietário não encontrado.' });
      
      const updated = await prisma.owner.update({ 
        where: { id }, 
        data: { isActive: !owner.isActive } 
      });
      return res.json(updated);
    } catch (error) { 
      console.error('Erro ao alterar status:', error);
      return res.status(500).json({ error: 'Erro ao alterar status.' }); 
    }
  }
}