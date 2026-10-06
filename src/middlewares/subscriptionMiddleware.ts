import { Request, Response, NextFunction } from 'express';
import { PrismaClient } from '@prisma/client';

// ==============================================================
// ESTENDE O TYPE DO EXPRESS APENAS COM O ALLOWED MODULES
// (O 'user' já está corretamente tipado no seu authMiddleware.ts!)
// ==============================================================
declare global {
  namespace Express {
    interface Request {
      allowedModules?: string[];
    }
  }
}

const prisma = new PrismaClient() as any;

export async function checkSubscription(req: Request, res: Response, next: NextFunction) {
  try {
    // Lemos como "any" apenas localmente para evitar conflitos de tipagem aqui
    const user = req.user as any; 
    const realEstateId = user?.realEstateId || user?.id;

    if (!realEstateId) {
      return res.status(401).json({ error: 'Identificação da imobiliária não encontrada.' });
    }

    // 1. Busca os dados da Imobiliária, Plano e Contrato SaaS
    const realEstate = await prisma.realEstate.findUnique({
      where: { id: realEstateId },
      include: {
        plan: true,
        masterContracts: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          include: {
            invoices: {
              where: { status: 'Pendente' },
              orderBy: { dueDate: 'asc' }
            }
          }
        }
      }
    });

    if (!realEstate || !realEstate.isActive) {
      return res.status(403).json({ error: 'Acesso suspenso. Entre em contato com o suporte da plataforma.' });
    }

    if (!realEstate.plan) {
      return res.status(403).json({ error: 'Nenhum plano SaaS ativo vinculado a esta imobiliária.' });
    }

    // 2. Verificação de Inadimplência (Tolerância de 5 dias após o vencimento)
    const latestContract = realEstate.masterContracts?.[0];
    if (latestContract && latestContract.invoices?.length > 0) {
      const oldestOverdueInvoice = latestContract.invoices[0];
      const dueDate = new Date(oldestOverdueInvoice.dueDate);
      const toleranceDate = new Date();
      toleranceDate.setDate(toleranceDate.getDate() - 5); // 5 dias de carência

      if (dueDate < toleranceDate) {
        return res.status(402).json({
          error: 'Assinatura bloqueada por pendência financeira.',
          code: 'SUBSCRIPTION_OVERDUE',
          invoiceId: oldestOverdueInvoice.id
        });
      }
    }

    // 3. Injeta os módulos liberados no request para validações pontuais
    req.allowedModules = realEstate.plan.modules || [];
    
    return next();
  } catch (error) {
    console.error('Erro na checagem de assinatura:', error);
    return res.status(500).json({ error: 'Falha ao validar assinatura da imobiliária.' });
  }
}

// Helper para validar módulo específico numa rota (ex: requireModule('keys'))
export function requireModule(moduleName: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    const allowed = req.allowedModules || [];
    if (!allowed.includes(moduleName)) {
      return res.status(403).json({
        error: `O módulo "${moduleName}" não faz parte do seu plano atual. Realize um upgrade para utilizá-lo.`
      });
    }
    return next();
  };
}