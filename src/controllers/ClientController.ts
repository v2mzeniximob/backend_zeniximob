import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient() as any;

export class ClientController {
  
  async create(req: Request, res: Response) {
    try {
      const user = req.user as any;
      const realEstateId = user?.realEstateId || user?.id;
      
      const { 
        clientType, name, corporateName, document, rg, stateRegistration, cityRegistration,
        cep, street, neighborhood, city, state, phone, email,
        maritalStatus, spouseName, spouseCpf, spouseRg, spouseDocUrl,
        respName, respCpf, respRg, respCep, respStreet, respNeighborhood, respCity, respState, respPhone, respEmail,
        
        // Garantias Locatícias & Fiador
        guaranteeType, insuranceCompanyId, guarantorName, guarantorCpf, guarantorRg, guarantorCivilStatus, guarantorPhone, guarantorEmail, guarantorAddress, guarantorIncome, guarantorDocUrl, guarantorPropertyRegistryUrl,
        
        // Checklist Financiamento
        educationLevel, financingDriveLink,
        
        isTenant, isBuyer, documentUrl, brokerId
      } = req.body;

      if (!document) return res.status(400).json({ error: 'O CPF ou CNPJ é obrigatório.' });

      const clientExists = await prisma.client.findUnique({ where: { document } });
      if (clientExists) return res.status(400).json({ error: 'Já existe um cliente cadastrado com este CPF/CNPJ.' });

      const client = await prisma.client.create({
        data: {
          clientType: clientType || 'PF',
          name, corporateName, document, rg, stateRegistration, cityRegistration,
          cep, street, neighborhood, city, state, phone, email,
          maritalStatus, spouseName, spouseCpf, spouseRg, spouseDocUrl,
          respName, respCpf, respRg, respCep, respStreet, respNeighborhood, respCity, respState, respPhone, respEmail,
          
          guaranteeType, insuranceCompanyId: insuranceCompanyId || null, 
          guarantorName, guarantorCpf, guarantorRg, guarantorCivilStatus, guarantorPhone, guarantorEmail, guarantorAddress, guarantorDocUrl, guarantorPropertyRegistryUrl,
          guarantorIncome: guarantorIncome ? Number(guarantorIncome) : null,
          
          educationLevel, financingDriveLink,
          
          isTenant: isTenant || false, 
          isBuyer: isBuyer || false,
          documentUrl, realEstateId, brokerId: brokerId || null
        }
      });

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
            name: leadName, phone: leadPhone, email: leadEmail,
            interest: interestType, status: "Novo", stage: "Novo",
            realEstateId, brokerId: brokerId || null
          }
        });
      }

      return res.status(201).json(client);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao cadastrar cliente.' });
    }
  }

  async list(req: Request, res: Response) {
    try {
      const user = req.user as any;
      const realEstateId = user?.realEstateId || user?.id;

      const clients = await prisma.client.findMany({
        where: { realEstateId },
        include: {
          broker: { select: { name: true } },
          insuranceCompany: { select: { name: true } },
          contracts: { include: { property: { select: { title: true, address: true, rentStatus: true } } } }
        },
        orderBy: { name: 'asc' }
      });

      return res.json(clients);
    } catch (error) {
      return res.status(500).json({ error: 'Erro ao listar clientes.' });
    }
  }

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
        
        // Garantias Locatícias & Fiador
        guaranteeType, insuranceCompanyId, guarantorName, guarantorCpf, guarantorRg, guarantorCivilStatus, guarantorPhone, guarantorEmail, guarantorAddress, guarantorIncome, guarantorDocUrl, guarantorPropertyRegistryUrl,
        
        // Checklist Financiamento
        educationLevel, financingDriveLink,
        
        isTenant, isBuyer, documentUrl, brokerId
      } = req.body;

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
          
          guaranteeType, insuranceCompanyId: insuranceCompanyId || null, 
          guarantorName, guarantorCpf, guarantorRg, guarantorCivilStatus, guarantorPhone, guarantorEmail, guarantorAddress, guarantorDocUrl, guarantorPropertyRegistryUrl,
          guarantorIncome: guarantorIncome ? Number(guarantorIncome) : null,
          
          educationLevel, financingDriveLink,
          
          isTenant, isBuyer, documentUrl, brokerId: brokerId || null
        }
      });

      const leadPhone = phone || respPhone || '';
      if (leadPhone) {
        await prisma.lead.updateMany({
          where: { realEstateId: realEstateId, phone: leadPhone },
          data: { brokerId: brokerId || null }
        });
      }

      return res.json({ success: true, message: 'Cliente atualizado com sucesso.' });
    } catch (error) {
      return res.status(500).json({ error: 'Erro ao atualizar cliente.' });
    }
  }

  async toggleStatus(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const client = await prisma.client.findUnique({ where: { id } });
      await prisma.client.update({ where: { id }, data: { isActive: !client.isActive } });
      return res.json({ success: true });
    } catch (error) {
      return res.status(500).json({ error: 'Erro ao alterar status.' });
    }
  }
}