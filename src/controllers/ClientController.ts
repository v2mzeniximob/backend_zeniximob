import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

// O 'as any' impede o TypeScript de dar falsos erros de tipagem com tabelas recém-criadas
const prisma = new PrismaClient() as any;

export class ClientController {
  
  // 1. CRIAR CLIENTE E GERAR LEAD AUTOMATICAMENTE
  async create(req: Request, res: Response) {
    try {
      const user = req.user as any;
      const realEstateId = user?.realEstateId || user?.id;
      if (!realEstateId) return res.status(403).json({ error: 'Acesso negado.' });

      const { 
        clientType, name, corporateName, document, rg, stateRegistration, cityRegistration,
        cep, street, neighborhood, city, state, phone, email,
        maritalStatus, spouseName, spouseCpf, spouseRg, spouseDocUrl,
        respName, respCpf, respRg, respCep, respStreet, respNeighborhood, respCity, respState, respPhone, respEmail,
        guarantorName, guarantorCpf, guarantorDocUrl,
        isTenant, isBuyer, documentUrl, brokerId
      } = req.body;

      if (!document) {
        return res.status(400).json({ error: 'O CPF ou CNPJ é obrigatório.' });
      }

      // Validação: Impede documentos duplicados na base de dados
      const clientExists = await prisma.client.findUnique({ where: { document } });
      if (clientExists) {
        return res.status(400).json({ error: 'Já existe um cliente cadastrado com este CPF/CNPJ.' });
      }

      // Criação do Cliente (PF ou PJ)
      const client = await prisma.client.create({
        data: {
          clientType: clientType || 'PF',
          name, corporateName, document, rg, stateRegistration, cityRegistration,
          cep, street, neighborhood, city, state, phone, email,
          maritalStatus, spouseName, spouseCpf, spouseRg, spouseDocUrl,
          respName, respCpf, respRg, respCep, respStreet, respNeighborhood, respCity, respState, respPhone, respEmail,
          guarantorName, guarantorCpf, guarantorDocUrl,
          isTenant: isTenant || false, 
          isBuyer: isBuyer || false,
          documentUrl,
          realEstateId,
          brokerId: brokerId || null
        }
      });

      // ==========================================================
      // A MAGIA DO CRM: GERAÇÃO AUTOMÁTICA DE LEAD
      // ==========================================================
      let interestType = "Novo Cliente Cadastrado";
      if (isBuyer && isTenant) interestType = "Comprador e Inquilino";
      else if (isBuyer) interestType = "Comprador";
      else if (isTenant) interestType = "Inquilino";

      const leadName = clientType === 'PJ' && corporateName ? corporateName : name;
      const leadPhone = phone || respPhone || '';
      const leadEmail = email || respEmail || '';

      if (leadName && leadPhone) {
        await prisma.lead.create({
          data: {
            name: leadName,
            phone: leadPhone,
            email: leadEmail,
            interest: interestType,
            status: "Novo",
            stage: "Novo",
            realEstateId,
            brokerId: brokerId || null // Vincula o card ao corretor selecionado!
          }
        });
      }

      return res.status(201).json(client);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao cadastrar cliente.' });
    }
  }

  // 2. LISTAR TODOS OS CLIENTES
  async list(req: Request, res: Response) {
    try {
      const user = req.user as any;
      const realEstateId = user?.realEstateId || user?.id;
      if (!realEstateId) return res.status(403).json({ error: 'Acesso negado.' });

      const clients = await prisma.client.findMany({
        where: { realEstateId },
        include: {
          broker: { select: { name: true } }, // Mostra qual corretor atende este cliente
          contracts: {
            include: {
              property: { select: { title: true, address: true, rentStatus: true } }
            }
          }
        },
        orderBy: { name: 'asc' }
      });

      return res.json(clients);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao listar clientes.' });
    }
  }

  // 3. ATUALIZAR CLIENTE
  async update(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const user = req.user as any;
      const realEstateId = user?.realEstateId || user?.id;
      
      const { 
        clientType, name, corporateName, document, rg, stateRegistration, cityRegistration,
        cep, street, neighborhood, city, state, phone, email,
        maritalStatus, spouseName, spouseCpf, spouseRg, spouseDocUrl,
        respName, respCpf, respRg, respCep, respStreet, respNeighborhood, respCity, respState, respPhone, respEmail,
        guarantorName, guarantorCpf, guarantorDocUrl,
        isTenant, isBuyer, documentUrl, brokerId
      } = req.body;

      // Se estiver a alterar o documento, verifica se não pertence a outro cliente
      if (document) {
        const existingDoc = await prisma.client.findUnique({ where: { document } });
        if (existingDoc && existingDoc.id !== id) {
          return res.status(400).json({ error: 'Este CPF/CNPJ já está em uso por outro cliente.' });
        }
      }

      await prisma.client.updateMany({
        where: { id, realEstateId },
        data: {
          clientType, name, corporateName, document, rg, stateRegistration, cityRegistration,
          cep, street, neighborhood, city, state, phone, email,
          maritalStatus, spouseName, spouseCpf, spouseRg, spouseDocUrl,
          respName, respCpf, respRg, respCep, respStreet, respNeighborhood, respCity, respState, respPhone, respEmail,
          guarantorName, guarantorCpf, guarantorDocUrl,
          isTenant, isBuyer, documentUrl,
          brokerId: brokerId || null
        }
      });

      return res.json({ success: true, message: 'Cliente atualizado com sucesso.' });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao atualizar cliente.' });
    }
  }

  // 4. ATIVAR / DESATIVAR CLIENTE
  async toggleStatus(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const user = req.user as any;
      const realEstateId = user?.realEstateId || user?.id;

      const client = await prisma.client.findFirst({ where: { id, realEstateId } });
      if (!client) return res.status(404).json({ error: 'Cliente não encontrado.' });

      await prisma.client.update({
        where: { id },
        data: { isActive: !client.isActive }
      });

      return res.json({ success: true, isActive: !client.isActive });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao alterar status do cliente.' });
    }
  }
}