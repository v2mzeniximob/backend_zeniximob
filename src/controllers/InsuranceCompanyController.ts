import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient() as any;

export class InsuranceCompanyController {
  async create(req: Request, res: Response) {
    try {
      const user = req.user as any;
      const realEstateId = user?.realEstateId || user?.id;
      const { name, cnpj, contactInfo } = req.body;

      const company = await prisma.insuranceCompany.create({
        data: { name, cnpj, contactInfo, realEstateId }
      });
      return res.status(201).json(company);
    } catch (error) {
      return res.status(500).json({ error: 'Erro ao criar seguradora.' });
    }
  }

  async list(req: Request, res: Response) {
    try {
      const user = req.user as any;
      const realEstateId = user?.realEstateId || user?.id;

      const companies = await prisma.insuranceCompany.findMany({
        where: { realEstateId },
        orderBy: { name: 'asc' }
      });
      return res.json(companies);
    } catch (error) {
      return res.status(500).json({ error: 'Erro ao listar seguradoras.' });
    }
  }

  async toggleStatus(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const company = await prisma.insuranceCompany.findUnique({ where: { id } });
      
      const updated = await prisma.insuranceCompany.update({
        where: { id },
        data: { isActive: !company.isActive }
      });
      return res.json(updated);
    } catch (error) {
      return res.status(500).json({ error: 'Erro ao alterar status.' });
    }
  }
}