import { Router } from 'express';
import { AuthController } from '../controllers/AuthController';
import { PlanController } from '../controllers/PlanController';
import { FranchiseeController } from '../controllers/FranchiseeController';
import { IntegrationController } from '../controllers/IntegrationController';
import { RealEstateController } from '../controllers/RealEstateController';
import { DashboardController } from '../controllers/DashboardController';
import { PropertyController } from '../controllers/PropertyController';
import { LeadController } from '../controllers/LeadController';
import { BrokerController } from '../controllers/BrokerController';
import { TenantController } from '../controllers/TenantController';
import { authMiddleware, masterOnly } from '../middlewares/authMiddleware';
import { OwnerController } from '../controllers/OwnerController';
import { ContractController } from '../controllers/ContractController';
import { InvoiceController } from '../controllers/InvoiceController';
import { SignatureController } from '../controllers/SignatureController';
import { VisitController } from '../controllers/VisitController';

const routes = Router();
const authController = new AuthController();
const planController = new PlanController();
const franchiseeController = new FranchiseeController();
const integrationController = new IntegrationController();
const realEstateController = new RealEstateController();
const dashboardController = new DashboardController();
const propertyController = new PropertyController();
const leadController = new LeadController();
const brokerController = new BrokerController();
const tenantController = new TenantController(); 
const ownerController = new OwnerController();
const contractController = new ContractController();
const invoiceController = new InvoiceController();
const signatureController = new SignatureController();
const visitController = new VisitController();

// ==========================================
// ROTAS PÚBLICAS
// ==========================================
routes.post('/login', authController.login);

// Vitrine da Loja (Lista todos os imóveis ativos)
routes.get('/public/stores/:slug', propertyController.listPublicByStore);

// Detalhes de um único imóvel na vitrine (Página detalhada)
routes.get('/public/stores/:slug/properties/:propertyId', propertyController.getPublicProperty);

// Rota pública para leads (quando o cliente envia mensagem na vitrine)
routes.post('/public/leads', async (req, res) => {
  try {
    const { name, phone, email, interest, status, notes, propertyId, realEstateId, brokerId } = req.body;
    const { PrismaClient } = require('@prisma/client');
    const prisma = new PrismaClient() as any;

    const lead = await prisma.lead.create({
      data: {
        name, phone, email, interest: interest || 'Geral',
        status: status || 'Novo', notes,
        propertyId: propertyId || null,
        brokerId: brokerId || null,
        realEstateId
      }
    });
    return res.status(201).json(lead);
  } catch (error) {
    return res.status(500).json({ error: 'Erro ao registar mensagem do cliente.' });
  }
});


// Rota para enviar contrato para assinatura digital
routes.post('/contracts/send-signature', authMiddleware, signatureController.sendForSignature);

// Webhook público para receber o evento de documento assinado
routes.post('/webhooks/signatures', signatureController.handleWebhook);

// ==========================================
// ROTAS PROTEGIDAS (Utilitários)
// ==========================================
routes.get('/integrations/cep/:cep', authMiddleware, integrationController.getCep);
routes.get('/integrations/cnpj/:cnpj', authMiddleware, integrationController.getCnpj);

// ==========================================
// ROTAS DA IMOBILIÁRIA (Protegidas)
// ==========================================

// Dashboard da Imobiliária (NOVO)
routes.get('/dashboard/metrics', authMiddleware, dashboardController.getRealEstateMetrics);

// --- Gestão de Inquilinos ---
routes.get('/tenants', authMiddleware, tenantController.list);
routes.post('/tenants', authMiddleware, tenantController.create);
routes.put('/tenants/:id', authMiddleware, tenantController.update);
routes.patch('/tenants/:id/status', authMiddleware, tenantController.toggleStatus);

// Imóveis
routes.get('/properties', authMiddleware, propertyController.list);
routes.post('/properties', authMiddleware, propertyController.create);
routes.put('/properties/:id', authMiddleware, propertyController.update);
routes.patch('/properties/:id/status', authMiddleware, propertyController.toggleStatus);
routes.put('/properties/:id/rental', authMiddleware, propertyController.updateRentalInfo);
routes.get('/properties/public/:slug', propertyController.listPublicByStore);

// Proprietários (Owners)
// Proprietários (Owners)
routes.get('/owners', authMiddleware, ownerController.list);
routes.post('/owners', authMiddleware, ownerController.create);
routes.put('/owners/:id', authMiddleware, ownerController.update);
routes.patch('/owners/:id/status', authMiddleware, ownerController.toggleStatus);
routes.post('/owners/:id/send-contract', authMiddleware, ownerController.generateAndSendContract);

// Contratos e Vistorias
routes.get('/contracts', authMiddleware, contractController.list);
routes.post('/contracts', authMiddleware, contractController.create);
routes.put('/contracts/:id', authMiddleware, contractController.update);
routes.post('/contracts/:id/inspections', authMiddleware, contractController.addInspection);
routes.post('/contracts/:id/send-signature', authMiddleware, contractController.sendToZapSign);

// Leads
routes.get('/leads', authMiddleware, leadController.list);
routes.post('/leads', authMiddleware, leadController.create);
routes.put('/leads/:id', authMiddleware, leadController.update);
routes.post('/leads/:id/history', authMiddleware, leadController.addHistoryEvent);

// Corretores
routes.get('/brokers', authMiddleware, brokerController.list);
routes.post('/brokers', authMiddleware, brokerController.create);
routes.put('/brokers/:id', authMiddleware, brokerController.update);
routes.patch('/brokers/:id/status', authMiddleware, brokerController.toggleStatus);

// Financeiro (Faturas e Repasses)   
routes.get('/invoices', authMiddleware, invoiceController.list);
routes.post('/invoices', authMiddleware, invoiceController.create);
routes.patch('/invoices/:id/pay', authMiddleware, invoiceController.markAsPaid);

// Configurações da Própria Loja
routes.get('/my-store', authMiddleware, realEstateController.getMyStore);
routes.put('/my-store', authMiddleware, realEstateController.updateMyStore);

// Gestão de Visitas
routes.get('/visits', authMiddleware, visitController.list);
routes.post('/visits', authMiddleware, visitController.create);
routes.patch('/visits/:id/status', authMiddleware, visitController.updateStatus);

// ==========================================
// ROTAS RESTRITAS (Apenas MASTER)
// ==========================================

// Dashboard do Master SaaS (ATUALIZADO)
routes.get('/master/dashboard/metrics', authMiddleware, masterOnly, dashboardController.getMasterStats);

routes.use('/plans', authMiddleware, masterOnly); 
routes.post('/plans', planController.create);
routes.get('/plans', planController.list);
routes.put('/plans/:id', planController.update);
routes.patch('/plans/:id/status', planController.toggleStatus);

routes.use('/franchisees', authMiddleware, masterOnly);
routes.post('/franchisees', franchiseeController.create);
routes.get('/franchisees', franchiseeController.list);
routes.put('/franchisees/:id', franchiseeController.update);
routes.patch('/franchisees/:id/status', franchiseeController.toggleStatus);

routes.use('/real-estates', authMiddleware, masterOnly);
routes.post('/real-estates', realEstateController.create);
routes.get('/real-estates', realEstateController.list);
routes.put('/real-estates/:id', realEstateController.update);
routes.patch('/real-estates/:id/status', realEstateController.toggleStatus);

export default routes;