import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient() as any;

export class ContractController {
  
  // 1, 2, 3 e 4 (CRIAR, LISTAR, ATUALIZAR E VISTORIA) mantêm-se iguais
  async create(req: Request, res: Response) {
    try {
      const user = req.user as any;
      const realEstateId = user?.realEstateId || user?.id;
      if (!realEstateId) return res.status(403).json({ error: 'Acesso negado.' });

      const { type, propertyId, tenantId, startDate, endDate, rentValue, adminFeePercent, readjustmentIndex, documentUrl } = req.body;
      if (!propertyId) return res.status(400).json({ error: 'Imóvel é obrigatório.' });

      const property = await prisma.property.findFirst({ where: { id: propertyId, realEstateId } });
      if (!property) return res.status(404).json({ error: 'Imóvel não encontrado.' });

      const contract = await prisma.contract.create({
        data: {
          type: type || 'Locação', status: 'Ativo', propertyId, tenantId: tenantId || null,
          startDate: new Date(startDate), endDate: endDate ? new Date(endDate) : null,
          rentValue: Number(rentValue), adminFeePercent: Number(adminFeePercent), readjustmentIndex, documentUrl
        }
      });

      if (contract.type === 'Locação') {
        await prisma.property.update({ where: { id: propertyId }, data: { rentStatus: 'Alugado', tenantId: tenantId || null } });
      }

      return res.status(201).json(contract);
    } catch (error) { return res.status(500).json({ error: 'Erro ao gerar contrato.' }); }
  }

  async list(req: Request, res: Response) {
    try {
      const user = req.user as any;
      const realEstateId = user?.realEstateId || user?.id;
      if (!realEstateId) return res.status(403).json({ error: 'Acesso negado.' });

      const status = req.query.status as string;
      const whereClause: any = { property: { realEstateId } };
      if (status) whereClause.status = status;

      const contracts = await prisma.contract.findMany({
        where: whereClause,
        include: {
          property: { select: { title: true, address: true, owner: { select: { name: true } } } },
          tenant: { select: { name: true, cpf: true, email: true, phone: true } },
          inspections: true
        },
        orderBy: { createdAt: 'desc' }
      });

      return res.json(contracts);
    } catch (error) { return res.status(500).json({ error: 'Erro ao listar contratos.' }); }
  }

  async update(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { status, documentUrl } = req.body;
      const user = req.user as any;
      const realEstateId = user?.realEstateId || user?.id;

      const contract = await prisma.contract.findUnique({ where: { id }, include: { property: true } });
      if (!contract || contract.property.realEstateId !== realEstateId) return res.status(404).json({ error: 'Contrato não encontrado.' });

      const updated = await prisma.contract.update({ where: { id }, data: { status, documentUrl } });
      if (status === 'Encerrado' && contract.type === 'Locação') {
        await prisma.property.update({ where: { id: contract.propertyId }, data: { rentStatus: 'Vago', tenantId: null } });
      }

      return res.json(updated);
    } catch (error) { return res.status(500).json({ error: 'Erro ao atualizar contrato.' }); }
  }

  async addInspection(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { type, date, reportUrl } = req.body;
      const user = req.user as any;
      const realEstateId = user?.realEstateId || user?.id;

      const contract = await prisma.contract.findUnique({ where: { id }, include: { property: true } });
      if (!contract || contract.property.realEstateId !== realEstateId) return res.status(404).json({ error: 'Contrato não encontrado.' });

      const inspection = await prisma.inspection.create({ data: { contractId: id, type: type || 'Rotina', date: new Date(date), reportUrl } });
      return res.status(201).json(inspection);
    } catch (error) { return res.status(500).json({ error: 'Erro ao registar vistoria.' }); }
  }

  // 🚀 INTEGRAÇÃO CLICKSIGN (Novo Motor)
  async sendToClicksign(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const user = req.user as any;
      const realEstateId = user?.realEstateId || user?.id;

      const contract = await prisma.contract.findUnique({
        where: { id },
        include: { tenant: true, property: { include: { owner: true } } }
      });

      if (!contract) return res.status(404).json({ error: 'Contrato não encontrado.' });
      if (!contract.tenant) return res.status(400).json({ error: 'Não há inquilino vinculado.' });
      if (!contract.tenant.email) return res.status(400).json({ error: 'Inquilino sem e-mail.' });

      const CLICKSIGN_TOKEN = process.env.CLICKSIGN_ACCESS_TOKEN?.trim();
      if (!CLICKSIGN_TOKEN) return res.status(500).json({ error: 'Token Clicksign não configurado no servidor.' });

      // ID do Modelo (Template) da Clicksign (Pegue no painel deles na aba Modelos)
      // Substitua pelo seu Key real da Clicksign!
      const TEMPLATE_KEY = "2c67cffd-5066-46cb-9a64-3e1881a1b1a0"; 
      
      const baseUrl = "https://app.clicksign.com/api/v1"; // Use sandbox.clicksign.com se for ambiente de testes

      const formatDate = (date: Date | null) => date ? new Date(date).toLocaleDateString('pt-BR') : 'Prazo indeterminado';
      const formatCurrency = (value: number) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

      // 1. CRIAR O DOCUMENTO A PARTIR DO MODELO
      const docResponse = await fetch(`${baseUrl}/templates/${TEMPLATE_KEY}/documents?access_token=${CLICKSIGN_TOKEN}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          document: {
            path: `/Contratos/Locacao_${contract.id}.docx`,
            template: {
              data: {
                "NOME_PROPRIETARIO": contract.property.owner?.name || 'Não informado',
                "NOME_INQUILINO": contract.tenant.name,
                "CPF_INQUILINO": contract.tenant.cpf || 'Não informado',
                "TELEFONE_INQUILINO": contract.tenant.phone || 'Não informado',
                "ENDERECO_IMOVEL": contract.property.address || 'Não informado',
                "DATA_INICIO": formatDate(contract.startDate),
                "DATA_FIM": formatDate(contract.endDate),
                "VALOR_ALUGUEL": formatCurrency(Number(contract.rentValue)),
                "INDICE_REAJUSTE": contract.readjustmentIndex || 'Não informado'
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

      // 2. CRIAR O SIGNATÁRIO (INQUILINO)
      const signerResponse = await fetch(`${baseUrl}/signers?access_token=${CLICKSIGN_TOKEN}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          signer: { email: contract.tenant.email, auths: ["email"], name: contract.tenant.name, has_documentation: false }
        })
      });
      const signerData = await signerResponse.json();
      const signerKey = signerData.signer.key;

      // 3. VINCULAR O SIGNATÁRIO AO DOCUMENTO
      const listResponse = await fetch(`${baseUrl}/lists?access_token=${CLICKSIGN_TOKEN}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          list: { document_key: documentKey, signer_key: signerKey, sign_as: "sign" }
        })
      });
      const listData = await listResponse.json();
      const signatureKey = listData.list.request_signature_key;
      const signUrl = listData.list.url; // Link direto para assinatura

      // 4. DISPARAR O E-MAIL OFICIAL PELA CLICKSIGN
      await fetch(`${baseUrl}/notifications?access_token=${CLICKSIGN_TOKEN}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ request_signature_key: signatureKey, message: "Olá! Segue o seu contrato de locação para assinatura." })
      });

      // 5. SALVAR NO BANCO DE DADOS
      const updatedContract = await prisma.contract.update({
        where: { id },
        data: { signUrl: signUrl, externalDocToken: documentKey, signatureStatus: 'Pendente' }
      });

      return res.json({ message: 'Contrato gerado e enviado via Clicksign!', signUrl: updatedContract.signUrl });

    } catch (error: any) {
      console.error("💥 ERRO CLICKSIGN:", error);
      return res.status(500).json({ error: 'Erro interno na integração Clicksign.' });
    }
  }
}