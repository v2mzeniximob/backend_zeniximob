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
      const owner = await prisma.owner.create({ data: { name, cpfOrCnpj, email, phone, bankData, realEstateId } });
      return res.status(201).json(owner);
    } catch (error) { return res.status(500).json({ error: 'Erro ao cadastrar proprietário.' }); }
  }

  async list(req: Request, res: Response) {
    try {
      const user = req.user as any;
      const realEstateId = user?.realEstateId || user?.id;
      
      const owners = await prisma.owner.findMany({
        where: { realEstateId }, include: { properties: { select: { id: true, title: true } } }, orderBy: { name: 'asc' }
      });
      return res.json(owners);
    } catch (error) { return res.status(500).json({ error: 'Erro ao listar proprietários.' }); }
  }

  async update(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { name, cpfOrCnpj, email, phone, bankData } = req.body;
      const user = req.user as any;
      const realEstateId = user?.realEstateId || user?.id;

      const updated = await prisma.owner.update({
        where: { id, realEstateId }, data: { name, cpfOrCnpj, email, phone, bankData }
      });
      return res.json(updated);
    } catch (error) { return res.status(500).json({ error: 'Erro ao atualizar proprietário.' }); }
  }

  async toggleStatus(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const owner = await prisma.owner.findUnique({ where: { id } });
      const updated = await prisma.owner.update({ where: { id }, data: { isActive: !owner.isActive } });
      return res.json(updated);
    } catch (error) { return res.status(500).json({ error: 'Erro ao alterar status.' }); }
  }

  // 🚀 INTEGRAÇÃO CLICKSIGN (Gestão do Proprietário)
  async sendToClicksign(req: Request, res: Response) {
    try {
      const { id } = req.params;
      
      const owner = await prisma.owner.findUnique({ where: { id } });
      if (!owner) return res.status(404).json({ error: 'Proprietário não encontrado.' });
      if (!owner.email) return res.status(400).json({ error: 'Proprietário não possui e-mail.' });

      const CLICKSIGN_TOKEN = process.env.CLICKSIGN_ACCESS_TOKEN?.trim();
      if (!CLICKSIGN_TOKEN) return res.status(500).json({ error: 'Token Clicksign não configurado (.env).' });

      // ID do Modelo (Template) da Clicksign (Pegue no painel deles)
      // Substitua pelo seu Key real da Clicksign!
      const TEMPLATE_KEY = "78a657ab-4481-4f4a-ac44-5fa0031fba75";

      const baseUrl = "https://sandbox.clicksign.com/api/v1";

      // 1. CRIAR O DOCUMENTO A PARTIR DO MODELO
      const docResponse = await fetch(`${baseUrl}/templates/${TEMPLATE_KEY}/documents?access_token=${CLICKSIGN_TOKEN}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          document: {
            path: `/Contratos/Gestao_${owner.id}.docx`,
            template: {
              data: {
                "NOME_PROPRIETARIO": owner.name,
                "CPF_CNPJ": owner.cpfOrCnpj,
                "TELEFONE": owner.phone || 'Não informado',
                "BANCO": owner.bankData || 'Não informado'
              }
            }
          }
        })
      });

      if (!docResponse.ok) {
        const err = await docResponse.text();
        return res.status(400).json({ error: 'Erro ao criar documento na Clicksign.', detail: err });
      }
      const docData = await docResponse.json();
      const documentKey = docData.document.key;

      // 2. CRIAR O SIGNATÁRIO (PROPRIETÁRIO)
      const signerResponse = await fetch(`${baseUrl}/signers?access_token=${CLICKSIGN_TOKEN}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          signer: { email: owner.email, auths: ["email"], name: owner.name, has_documentation: false }
        })
      });
      const signerData = await signerResponse.json();
      const signerKey = signerData.signer.key;

      // 3. VINCULAR SIGNATÁRIO AO DOCUMENTO
      const listResponse = await fetch(`${baseUrl}/lists?access_token=${CLICKSIGN_TOKEN}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          list: { document_key: documentKey, signer_key: signerKey, sign_as: "sign" }
        })
      });
      const listData = await listResponse.json();
      const signatureKey = listData.list.request_signature_key;
      const signUrl = listData.list.url;

      // 4. DISPARAR O E-MAIL DE ASSINATURA
      await fetch(`${baseUrl}/notifications?access_token=${CLICKSIGN_TOKEN}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ request_signature_key: signatureKey, message: "Olá! Segue o seu contrato de gestão imobiliária para assinatura." })
      });

      // 5. SALVAR NO BANCO
      const updatedOwner = await prisma.owner.update({
        where: { id },
        data: { managementContractUrl: signUrl, contractToken: documentKey }
      });

      return res.json({ message: 'Contrato gerado com sucesso na Clicksign!', signUrl: updatedOwner.managementContractUrl, owner: updatedOwner });
      
    } catch (error: any) {
      console.error("💥 ERRO BACKEND:", error);
      return res.status(500).json({ error: 'Erro no servidor' });
    }
  }
}