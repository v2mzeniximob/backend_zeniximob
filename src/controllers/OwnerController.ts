import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient() as any;

export class OwnerController {
  
  async create(req: Request, res: Response) {
    try {
      const user = req.user as any;
      const realEstateId = user?.realEstateId || user?.id;
      if (!realEstateId) return res.status(403).json({ error: 'Acesso negado.' });

      const { name, cpfOrCnpj, email, phone, bankData } = req.body;

      const owner = await prisma.owner.create({
        data: { name, cpfOrCnpj, email, phone, bankData, realEstateId }
      });

      return res.status(201).json(owner);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao cadastrar proprietário.' });
    }
  }

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
      return res.status(500).json({ error: 'Erro ao listar proprietários.' });
    }
  }

  async update(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { name, cpfOrCnpj, email, phone, bankData } = req.body;
      const user = req.user as any;
      const realEstateId = user?.realEstateId || user?.id;

      const updated = await prisma.owner.update({
        where: { id, realEstateId },
        data: { name, cpfOrCnpj, email, phone, bankData }
      });
      return res.json(updated);
    } catch (error) {
      return res.status(500).json({ error: 'Erro ao atualizar proprietário.' });
    }
  }

  async toggleStatus(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const owner = await prisma.owner.findUnique({ where: { id } });
      const updated = await prisma.owner.update({
        where: { id },
        data: { isActive: !owner.isActive }
      });
      return res.json(updated);
    } catch (error) {
      return res.status(500).json({ error: 'Erro ao alterar status.' });
    }
  }

  //ZAPSIGN (Proprietário)
  async generateAndSendContract(req: Request, res: Response) {
    try {
      const { id } = req.params;
      
      const owner = await prisma.owner.findUnique({ where: { id } });
      if (!owner) return res.status(404).json({ error: 'Proprietário não encontrado.' });
      if (!owner.email) return res.status(400).json({ error: 'Proprietário não possui e-mail cadastrado.' });

      // 🔥 Limpa aspas e espaços acidentais
      const ZAPSIGN_TOKEN = process.env.ZAPSIGN_API_TOKEN?.replace(/['"]/g, '').trim();
      if (!ZAPSIGN_TOKEN) return res.status(500).json({ error: 'Token da ZapSign não configurado no servidor (.env).' });

      console.log(`🔑 [PROPRIETÁRIO] Disparando ZapSign. Token inicia com: ${ZAPSIGN_TOKEN.substring(0, 6)}...`);

      const TEMPLATE_ID = "79d9fa5a-eba4-4de4-8671-19b7b9ffbd19".trim();

      const zapsignPayload = {
        template_id: TEMPLATE_ID,
        signer_name: owner.name,
        signer_email: owner.email,
        data: [
          { de: "{{NOME_PROPRIETARIO}}", para: owner.name },
          { de: "{{CPF_CNPJ}}", para: owner.cpfOrCnpj },
          { de: "{{TELEFONE}}", para: owner.phone || 'Não informado' },
          { de: "{{BANCO}}", para: owner.bankData || 'Não informado' }
        ]
      };

      const urlZapSign = `https://api.zapsign.com.br/api/v1/models/${TEMPLATE_ID}/docs/`;
      
      const zapResponse = await fetch(urlZapSign, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${ZAPSIGN_TOKEN.trim()}`
        },
        body: JSON.stringify(zapsignPayload)
      });
      const responseText = await zapResponse.text();

      if (!zapResponse.ok) {
        console.error("⛔ RECUSA DA ZAPSIGN:", responseText);
        return res.status(400).json({ error: 'A ZapSign recusou a geração do contrato.', detalheExato: responseText });
      }

      const zapData = JSON.parse(responseText);
      const updatedOwner = await prisma.owner.update({
        where: { id },
        data: { managementContractUrl: zapData.signers[0].sign_url, contractToken: zapData.token }
      });

      return res.json({ message: 'Contrato dinâmico gerado com sucesso!', signUrl: updatedOwner.managementContractUrl, owner: updatedOwner });
      
    } catch (error: any) {
      console.error("💥 ERRO DETALHADO NO BACKEND:", error);
      return res.status(500).json({ error: 'Erro no servidor' });
    }
  }
}