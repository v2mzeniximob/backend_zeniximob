import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient() as any;

export class ContractController {
  
  // 1. CRIAR CONTRATO
  async create(req: Request, res: Response) {
    try {
      const user = req.user as any;
      const realEstateId = user?.realEstateId || user?.id;
      if (!realEstateId) return res.status(403).json({ error: 'Acesso negado.' });

      const {
        type, propertyId, tenantId, startDate, endDate, rentValue, adminFeePercent, readjustmentIndex, documentUrl
      } = req.body;

      if (!propertyId) return res.status(400).json({ error: 'Imóvel é obrigatório.' });

      const property = await prisma.property.findFirst({
        where: { id: propertyId, realEstateId }
      });

      if (!property) return res.status(404).json({ error: 'Imóvel não encontrado.' });

      const contract = await prisma.contract.create({
        data: {
          type: type || 'Locação',
          status: 'Ativo',
          propertyId,
          tenantId: tenantId || null,
          startDate: new Date(startDate),
          endDate: endDate ? new Date(endDate) : null,
          rentValue: Number(rentValue),
          adminFeePercent: Number(adminFeePercent),
          readjustmentIndex,
          documentUrl
        }
      });

      if (contract.type === 'Locação') {
        await prisma.property.update({
          where: { id: propertyId },
          data: { rentStatus: 'Alugado', tenantId: tenantId || null }
        });
      }

      return res.status(201).json(contract);
    } catch (error) {
      console.error('Erro ao gerar contrato:', error);
      return res.status(500).json({ error: 'Erro ao gerar contrato.' });
    }
  }

  // 2. LISTAR CONTRATOS
  async list(req: Request, res: Response) {
    try {
      const user = req.user as any;
      const realEstateId = user?.realEstateId || user?.id;
      if (!realEstateId) return res.status(403).json({ error: 'Acesso negado.' });

      const status = req.query.status as string;

      const whereClause: any = {
        property: { realEstateId }
      };

      if (status) {
        whereClause.status = status;
      }

      const contracts = await prisma.contract.findMany({
        where: whereClause,
        include: {
          property: {
            select: { title: true, address: true, owner: { select: { name: true } } }
          },
          tenant: { select: { name: true, cpf: true, email: true, phone: true } },
          inspections: true
        },
        orderBy: { createdAt: 'desc' }
      });

      return res.json(contracts);
    } catch (error) {
      console.error('Erro ao listar contratos:', error);
      return res.status(500).json({ error: 'Erro ao listar contratos.' });
    }
  }

  // 3. ATUALIZAR CONTRATO
  async update(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { status, documentUrl } = req.body;
      const user = req.user as any;
      const realEstateId = user?.realEstateId || user?.id;

      const contract = await prisma.contract.findUnique({
        where: { id },
        include: { property: true }
      });

      if (!contract || contract.property.realEstateId !== realEstateId) {
         return res.status(404).json({ error: 'Contrato não encontrado.' });
      }

      const updated = await prisma.contract.update({
        where: { id },
        data: { status, documentUrl }
      });

      if (status === 'Encerrado' && contract.type === 'Locação') {
        await prisma.property.update({
          where: { id: contract.propertyId },
          data: { rentStatus: 'Vago', tenantId: null }
        });
      }

      return res.json(updated);
    } catch (error) {
      console.error('Erro ao atualizar contrato:', error);
      return res.status(500).json({ error: 'Erro ao atualizar contrato.' });
    }
  }

  // 4. ADICIONAR VISTORIA
  async addInspection(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { type, date, reportUrl } = req.body;
      const user = req.user as any;
      const realEstateId = user?.realEstateId || user?.id;

      const contract = await prisma.contract.findUnique({
        where: { id },
        include: { property: true }
      });

      if (!contract || contract.property.realEstateId !== realEstateId) {
         return res.status(404).json({ error: 'Contrato não encontrado.' });
      }

      const inspection = await prisma.inspection.create({
        data: {
          contractId: id,
          type: type || 'Rotina',
          date: new Date(date),
          reportUrl
        }
      });

      return res.status(201).json(inspection);
    } catch (error) {
      console.error('Erro ao registar vistoria:', error);
      return res.status(500).json({ error: 'Erro ao registar vistoria.' });
    }
  }

  // NOVO: Gerar e Disparar Contrato de Locação usando TEMPLATE (Word)
  async sendToZapSign(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const user = req.user as any;
      const realEstateId = user?.realEstateId || user?.id;

      // 1. Puxar o contrato, o inquilino, o imóvel E O PROPRIETÁRIO do imóvel
      const contract = await prisma.contract.findUnique({
        where: { id },
        include: { 
          tenant: true,
          property: {
            include: { owner: true } // Precisamos disto para preencher o {{NOME_PROPRIETARIO}}
          } 
        }
      });

      if (!contract) return res.status(404).json({ error: 'Contrato não encontrado.' });
      if (contract.property.realEstateId !== realEstateId) return res.status(403).json({ error: 'Acesso negado.' });
      if (!contract.tenant) return res.status(400).json({ error: 'Não há inquilino vinculado a este contrato.' });
      if (!contract.tenant.email) return res.status(400).json({ error: 'O Inquilino não possui e-mail cadastrado.' });

      const ZAPSIGN_TOKEN = process.env.ZAPSIGN_API_TOKEN;
      if (!ZAPSIGN_TOKEN) return res.status(500).json({ error: 'Token ZapSign não configurado no servidor.' });

      // ID DO MODELO DA ZAPSIGN
      const TEMPLATE_ID = "caea5a87-9839-44e7-9c12-5788ca6bfbee".trim();

      // Formatadores de data e moeda
      const formatDate = (date: Date | null) => date ? new Date(date).toLocaleDateString('pt-BR') : 'Prazo indeterminado';
      const formatCurrency = (value: number) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

      // 2. Preencher as Variáveis do Word (Onde acontece a Magia)
      const zapsignPayload = {
        name: `Contrato de Locação - ${contract.property.title} - ${contract.tenant.name}`,
        data: [
          { de: "{{NOME_PROPRIETARIO}}", para: contract.property.owner?.name || 'Não informado' },
          { de: "{{NOME_INQUILINO}}", para: contract.tenant.name },
          { de: "{{CPF_INQUILINO}}", para: contract.tenant.cpf || 'Não informado' },
          { de: "{{TELEFONE_INQUILINO}}", para: contract.tenant.phone || 'Não informado' },
          { de: "{{ENDERECO_IMOVEL}}", para: contract.property.address || 'Não informado' },
          { de: "{{DATA_INICIO}}", para: formatDate(contract.startDate) },
          { de: "{{DATA_FIM}}", para: formatDate(contract.endDate) },
          { de: "{{VALOR_ALUGUEL}}", para: formatCurrency(Number(contract.rentValue)) },
          { de: "{{INDICE_REAJUSTE}}", para: contract.readjustmentIndex || 'Não informado' }
        ],
        signers: [
          {
            name: contract.tenant.name,
            email: contract.tenant.email,
            send_via: "email"
          }
        ]
      };

      // 3. Disparo para a API de Modelos (Templates) da ZapSign
      const zapResponse = await fetch(`https://sandbox.api.zapsign.com.br/api/v1/models/${TEMPLATE_ID}/docs/?api_token=${ZAPSIGN_TOKEN}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(zapsignPayload)
      });

      const responseText = await zapResponse.text();

      if (!zapResponse.ok) {
        console.error("⛔ RECUSA DA ZAPSIGN:", responseText);
        return res.status(400).json({ 
          error: 'A ZapSign recusou o contrato.', 
          detalheExato: responseText 
        });
      }

      const zapData = JSON.parse(responseText);

      // 4. Salvar os links na Base de Dados
      const updatedContract = await prisma.contract.update({
        where: { id },
        data: { 
          signUrl: zapData.signers[0].sign_url,
          externalDocToken: zapData.token,
          signatureStatus: 'Pendente'
        }
      });

      return res.json({ 
        message: 'Contrato de locação gerado e enviado para o Inquilino com sucesso!', 
        signUrl: updatedContract.signUrl 
      });

    } catch (error: any) {
      console.error("💥 ERRO ZAPSIGN CONTRATO:", error);
      return res.status(500).json({ 
        error: 'Erro interno ao disparar assinatura.', 
        detalheExato: error.message || error.toString() 
      });
    }
  }
}