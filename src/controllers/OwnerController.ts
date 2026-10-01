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

  // Gerar e Disparar Contrato REAL pela ZapSign
  async generateAndSendContract(req: Request, res: Response) {
    try {
      const { id } = req.params;
      
      const owner = await prisma.owner.findUnique({ where: { id } });
      if (!owner) return res.status(404).json({ error: 'Proprietário não encontrado.' });
      if (!owner.email) return res.status(400).json({ error: 'Proprietário não possui e-mail cadastrado.' });

      // 1. Pegar a chave da ZapSign do arquivo .env
      const ZAPSIGN_TOKEN = process.env.ZAPSIGN_API_TOKEN;
      if (!ZAPSIGN_TOKEN) {
        return res.status(500).json({ error: 'Token da ZapSign não configurado no servidor (.env).' });
      }

      // 2. Montar os dados para a ZapSign (PDF válido e público)
      const zapsignPayload = {
        name: `Contrato de Gestão - ${owner.name}`,
        url_pdf: "https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf",
        signers: [
          {
            name: owner.name,
            email: owner.email,
            send_via: "email"
          }
        ]
      };

      // 3. Fazer o disparo oficial para a API da ZapSign
      // (Testes / Gratuito SandBox):
      const zapResponse = await fetch(`https://sandbox.api.zapsign.com.br/api/v1/docs/?api_token=${ZAPSIGN_TOKEN}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(zapsignPayload)
      });

      // MAGIA AQUI: Lemos como texto primeiro para não quebrar o servidor!
      const responseText = await zapResponse.text();

      // Se a ZapSign disser que deu erro (Status 400 ou 500)
      if (!zapResponse.ok) {
        console.error("⛔ RECUSA DA ZAPSIGN:", responseText);
        return res.status(400).json({ 
          error: 'A ZapSign recusou a geração do contrato.', 
          detalheExato: responseText 
        });
      }

      // Se passou, aí sim convertemos para JSON com segurança
      const zapData = JSON.parse(responseText);

      // 4. Extrair os links verdadeiros que a ZapSign nos devolveu
      const externalDocToken = zapData.token;
      const signUrl = zapData.signers[0].sign_url;

      // 5. Salvar na nossa base de dados
      const updatedOwner = await prisma.owner.update({
        where: { id },
        data: { 
          managementContractUrl: signUrl,
          contractToken: externalDocToken
        }
      });

      return res.json({ 
        message: 'Contrato gerado e enviado via ZapSign com sucesso!', 
        signUrl, 
        owner: updatedOwner 
      });
      
    } catch (error: any) {
      console.error("💥 ERRO DETALHADO NO BACKEND:", error);
      return res.status(500).json({ 
        error: 'Erro no servidor', 
        detalheExato: error.message || error.toString() 
      });
    }
  }
}