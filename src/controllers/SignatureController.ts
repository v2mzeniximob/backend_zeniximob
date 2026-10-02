import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export class SignatureController {
  
  // 1. Recebe o contrato assinado entre IMOBILIÁRIA x INQUILINO
  async uploadTenantContract(req: Request, res: Response) {
    try {
      const id = req.params.id as string; //Garante ao Prisma que é uma string
      const file = (req as any).file;     //Garante ao TS que o Multer injetou o 'file'

      if (!file) {
        return res.status(400).json({ error: 'Nenhum ficheiro PDF enviado.' });
      }

      // Constrói a URL pública do ficheiro
      const fileUrl = `${req.protocol}://${req.get('host')}/uploads/${file.filename}`;

      // Atualiza o contrato para "Ativo" e guarda o link do PDF
      const updatedContract = await prisma.contract.update({
        where: { id },
        data: {
          status: 'Ativo',
          documentUrl: fileUrl,
          signatureStatus: 'Assinado via Gov.br'
        }
      });

      return res.json({ 
        message: 'Contrato do inquilino anexado com sucesso!', 
        contract: updatedContract 
      });
    } catch (error) {
      console.error('Erro ao anexar contrato do inquilino:', error);
      return res.status(500).json({ error: 'Falha ao processar o ficheiro.' });
    }
  }

  // 2. Recebe o contrato assinado entre IMOBILIÁRIA x PROPRIETÁRIO
  async uploadOwnerContract(req: Request, res: Response) {
    try {
      const id = req.params.id as string; 
      const file = (req as any).file;     

      if (!file) {
        return res.status(400).json({ error: 'Nenhum ficheiro PDF enviado.' });
      }

      const fileUrl = `${req.protocol}://${req.get('host')}/uploads/${file.filename}`;

      // Guarda o link do PDF no cadastro do proprietário
      const updatedOwner = await prisma.owner.update({
        where: { id },
        data: {
          managementContractUrl: fileUrl
        }
      });

      return res.json({ 
        message: 'Contrato do proprietário anexado com sucesso!', 
        owner: updatedOwner 
      });
    } catch (error) {
      console.error('Erro ao anexar contrato do proprietário:', error);
      return res.status(500).json({ error: 'Falha ao processar o ficheiro.' });
    }
  }

  // 3. Recebe o contrato assinado entre PLATAFORMA (MASTER) x IMOBILIÁRIA
  async uploadRealEstateContract(req: Request, res: Response) {
    try {
      const id = req.params.id as string; 
      const file = (req as any).file;     

      if (!file) {
        return res.status(400).json({ error: 'Nenhum ficheiro PDF enviado.' });
      }

      const fileUrl = `${req.protocol}://${req.get('host')}/uploads/${file.filename}`;

      // Atualiza a URL do contrato da Imobiliária
      const updatedRealEstate = await prisma.realEstate.update({
        where: { id },
        data: {
          contractUrl: fileUrl 
        }
      });

      return res.json({ 
        message: 'Contrato da imobiliária anexado com sucesso!', 
        realEstate: updatedRealEstate 
      });
    } catch (error) {
      console.error('Erro ao anexar contrato da imobiliária:', error);
      return res.status(500).json({ error: 'Falha ao processar o ficheiro.' });
    }
  }
}