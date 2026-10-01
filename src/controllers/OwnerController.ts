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

 // Gerar e Disparar Contrato diretamente para o Proprietário
  async generateAndSendContract(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { pdfBase64, documentText } = req.body; 

      const owner = await prisma.owner.findUnique({ where: { id } });
      if (!owner) return res.status(404).json({ error: 'Proprietário não encontrado.' });
      if (!owner.email) return res.status(400).json({ error: 'Proprietário não possui e-mail cadastrado.' });

      // Simulação da Integração com Clicksign/ZapSign
      const externalDocToken = `DOC-OWNER-${Date.now()}`;
      const signUrl = `https://sandbox.assinatura.com/sign/${externalDocToken}`;

      // Salva o link no cadastro do proprietário
      const updatedOwner = await prisma.owner.update({
        where: { id },
        data: { 
          managementContractUrl: signUrl,
          contractToken: externalDocToken
        }
      });

      return res.json({ 
        message: 'Contrato enviado com sucesso!', 
        signUrl, 
        owner: updatedOwner 
      });
    } catch (error: any) {
      console.error("💥 ERRO DETALHADO NO BACKEND:", error);
      //Devolver o erro exato para o navegador
      return res.status(500).json({ 
        error: 'Erro no servidor', 
        detalheExato: error.message || error.toString() 
      });
    }
  }
}