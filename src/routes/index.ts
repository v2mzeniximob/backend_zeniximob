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
import { ClientController } from '../controllers/ClientController';
import { TenantController } from '../controllers/TenantController';
import { authMiddleware, masterOnly, portalOnly } from '../middlewares/authMiddleware'; 
import { OwnerController } from '../controllers/OwnerController';
import { ContractController } from '../controllers/ContractController';
import { InvoiceController } from '../controllers/InvoiceController';
import { SignatureController } from '../controllers/SignatureController';
import { VisitController } from '../controllers/VisitController';
import { ProposalController } from '../controllers/ProposalController'; 
import { KeyTermController } from '../controllers/KeyTermController';   
import { InsuranceCompanyController } from '../controllers/InsuranceCompanyController';
import { AiController } from '../controllers/AiController';
import { XmlController } from '../controllers/XmlController';
import { TicketController } from '../controllers/TicketController';
import { KeyController } from '../controllers/KeyController';
import { MasterConfigController } from '../controllers/MasterConfigController';
import { MasterContractController } from '../controllers/MasterContractController';
import { MasterInvoiceController } from '../controllers/MasterInvoiceController';
import { checkSubscription, requireModule } from '../middlewares/subscriptionMiddleware';
import { CondominiumController } from '../controllers/CondominiumController';
// NOVO: Importação do DealController para a Esteira de Vendas (Kanban)
import { DealController } from '../controllers/DealController';

import { upload } from '../middlewares/upload';
import { ClientPortalController } from '../controllers/ClientPortalController';

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
const clientController = new ClientController();
const tenantController = new TenantController(); 
const ownerController = new OwnerController();
const contractController = new ContractController();
const invoiceController = new InvoiceController();
const signatureController = new SignatureController();
const visitController = new VisitController();
const proposalController = new ProposalController(); 
const keyTermController = new KeyTermController();   
const insuranceCompanyController = new InsuranceCompanyController();
const aiController = new AiController();
const xmlController = new XmlController();
const ticketController = new TicketController();
const clientPortalController = new ClientPortalController(); 
const keyController = new KeyController();
const masterConfigController = new MasterConfigController();
const masterContractController = new MasterContractController();
const masterInvoiceController = new MasterInvoiceController();
const condominiumController = new CondominiumController();
const dealController = new DealController();

// ==========================================
// ROTAS PÚBLICAS
// ==========================================
routes.post('/login', authController.login);
routes.post('/portal/login', clientPortalController.login);

routes.get('/public/stores/:slug', propertyController.listPublicByStore);
routes.get('/public/stores/:slug/properties/:propertyId', propertyController.getPublicProperty);
routes.get('/public/xml/:slug', xmlController.generateFeed);

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

// ==========================================
// ROTAS DO PORTAL DO CLIENTE (Inquilino / Proprietário)
// ==========================================
routes.get('/portal/dashboard', authMiddleware, portalOnly, clientPortalController.getDashboard);
routes.post('/portal/tickets', authMiddleware, portalOnly, ticketController.create);
routes.post('/portal/tickets/:id/messages', authMiddleware, portalOnly, ticketController.addMessage);

// ==========================================
// ROTAS PROTEGIDAS (Utilitários)
// ==========================================
routes.get('/integrations/cep/:cep', authMiddleware, integrationController.getCep);
routes.get('/integrations/cnpj/:cnpj', authMiddleware, integrationController.getCnpj);

// ==========================================
// ROTAS DA IMOBILIÁRIA (Protegidas)
// ==========================================
routes.get('/dashboard/metrics', authMiddleware, dashboardController.getRealEstateMetrics);

routes.post('/clients', authMiddleware, clientController.create);
routes.get('/clients', authMiddleware, clientController.list);
routes.put('/clients/:id', authMiddleware, clientController.update);
routes.patch('/clients/:id/status', authMiddleware, clientController.toggleStatus);

routes.post('/portal/generate-access', authMiddleware, clientPortalController.createAccess);

routes.post('/tenants', authMiddleware, tenantController.create);
routes.get('/tenants', authMiddleware, tenantController.list);
routes.put('/tenants/:id', authMiddleware, tenantController.update);
routes.patch('/tenants/:id/status', authMiddleware, tenantController.toggleStatus);

routes.post('/condominiums', authMiddleware, condominiumController.create);
routes.get('/condominiums', authMiddleware, condominiumController.list);
routes.put('/condominiums/:id', authMiddleware, condominiumController.update);
routes.patch('/condominiums/:id/status', authMiddleware, condominiumController.toggleStatus);

routes.get('/properties', authMiddleware, propertyController.list);
routes.post('/properties', authMiddleware, propertyController.create);
routes.put('/properties/:id', authMiddleware, propertyController.update);
routes.patch('/properties/:id/status', authMiddleware, propertyController.toggleStatus);
routes.put('/properties/:id/rental', authMiddleware, propertyController.updateRentalInfo);
routes.get('/properties/public/:slug', propertyController.listPublicByStore);

routes.get('/owners', authMiddleware, ownerController.list);
routes.post('/owners', authMiddleware, ownerController.create);
routes.put('/owners/:id', authMiddleware, ownerController.update);
routes.patch('/owners/:id/status', authMiddleware, ownerController.toggleStatus);

routes.post('/proposals', authMiddleware, proposalController.create);
routes.get('/proposals', authMiddleware, proposalController.list);
routes.put('/proposals/:id', authMiddleware, proposalController.update);
routes.delete('/proposals/:id', authMiddleware, proposalController.delete);
routes.patch('/proposals/:id/status', authMiddleware, proposalController.updateStatus);

routes.post('/key-terms', authMiddleware, keyTermController.create);
routes.get('/key-terms', authMiddleware, keyTermController.list);
routes.patch('/key-terms/:id/status', authMiddleware, keyTermController.updateStatus);
routes.put('/key-terms/:id', authMiddleware, keyTermController.update);
routes.delete('/key-terms/:id', authMiddleware, keyTermController.delete);

routes.get('/keys', authMiddleware, keyController.list);
routes.patch('/keys/:id/code', authMiddleware, keyController.updateKeyCode);
routes.post('/keys/withdraw', authMiddleware, keyController.withdraw);
routes.patch('/keys/:movementId/return', authMiddleware, keyController.returnKey);

routes.post('/insurance-companies', authMiddleware, insuranceCompanyController.create);
routes.get('/insurance-companies', authMiddleware, insuranceCompanyController.list);
routes.patch('/insurance-companies/:id/status', authMiddleware, insuranceCompanyController.toggleStatus);

routes.get('/contracts', authMiddleware, contractController.list);
routes.post('/contracts', authMiddleware, contractController.create);
routes.put('/contracts/:id', authMiddleware, contractController.update);
routes.post('/contracts/:id/inspections', authMiddleware, contractController.addInspection);
routes.delete('/contracts/:id', authMiddleware, contractController.delete);

routes.post('/contracts/:id/upload', authMiddleware, upload.single('file'), signatureController.uploadTenantContract);
routes.post('/owners/:id/upload', authMiddleware, upload.single('file'), signatureController.uploadOwnerContract);

routes.get('/leads', authMiddleware, leadController.list);
routes.post('/leads', authMiddleware, leadController.create);
routes.put('/leads/:id', authMiddleware, leadController.update);
routes.post('/leads/:id/history', authMiddleware, leadController.addHistoryEvent);
routes.get('/leads/:id/matches', authMiddleware, leadController.getMatches);

// ==========================================
// NOVO: ESTEIRA DE VENDAS E LOCAÇÃO (KANBAN)
// ==========================================
routes.get('/deals/stages', authMiddleware, dealController.listStages);
routes.post('/deals/stages', authMiddleware, dealController.createStage);
routes.post('/deals', authMiddleware, dealController.createDeal);
routes.put('/deals/:id', authMiddleware, dealController.updateDeal);
routes.patch('/deals/:id/move', authMiddleware, dealController.moveDeal);
routes.delete('/deals/:id', authMiddleware, dealController.deleteDeal);

routes.get('/brokers', authMiddleware, brokerController.list);
routes.post('/brokers', authMiddleware, brokerController.create);
routes.get('/brokers/reports/commissions', authMiddleware, brokerController.getCommissionReport);
routes.put('/brokers/:id', authMiddleware, brokerController.update);
routes.patch('/brokers/:id/status', authMiddleware, brokerController.toggleStatus);

routes.get('/invoices', authMiddleware, invoiceController.list);
routes.post('/invoices', authMiddleware, invoiceController.create);
routes.patch('/invoices/:id/pay', authMiddleware, invoiceController.markAsPaid);
routes.post('/invoices/:id/charge', authMiddleware, invoiceController.generateCharge);
routes.put('/invoices/:id/repasse', authMiddleware, invoiceController.updateRepasse);

routes.get('/my-store', authMiddleware, realEstateController.getMyStore);
routes.put('/my-store', authMiddleware, realEstateController.updateMyStore);

routes.get('/visits', authMiddleware, visitController.list);
routes.post('/visits', authMiddleware, visitController.create);
routes.patch('/visits/:id/status', authMiddleware, visitController.updateStatus);
routes.put('/visits/:id', authMiddleware, visitController.updateStatus);

routes.post('/ai/generate-description', authMiddleware, aiController.generateDescription);

routes.post('/tickets', authMiddleware, ticketController.create);
routes.get('/tickets', authMiddleware, ticketController.list);
routes.patch('/tickets/:id/status', authMiddleware, ticketController.updateStatus);
routes.post('/tickets/:id/messages', authMiddleware, ticketController.addMessage);

// ==========================================
// ROTAS RESTRITAS (Apenas MASTER)
// ==========================================
routes.get('/master/dashboard/metrics', authMiddleware, masterOnly, dashboardController.getMasterStats);
routes.post('/real-estates/:id/upload', authMiddleware, masterOnly, upload.single('file'), signatureController.uploadRealEstateContract);

routes.get('/master/config', authMiddleware, masterOnly, masterConfigController.get);
routes.put('/master/config', authMiddleware, masterOnly, masterConfigController.update);

routes.get('/master/admins', authMiddleware, masterOnly, masterConfigController.listAdmins);
routes.post('/master/admins', authMiddleware, masterOnly, masterConfigController.createAdmin);
routes.patch('/master/admins/:id/status', authMiddleware, masterOnly, masterConfigController.toggleAdminStatus);

routes.post('/master/contracts', authMiddleware, masterOnly, masterContractController.create);
routes.put('/master/contracts/:id', authMiddleware, masterOnly, masterContractController.update);
routes.get('/master/contracts', authMiddleware, masterOnly, masterContractController.list);
routes.delete('/master/contracts/:id', authMiddleware, masterOnly, masterContractController.delete);

routes.get('/master/invoices', authMiddleware, masterOnly, masterInvoiceController.list);
routes.patch('/master/invoices/:id/pay', authMiddleware, masterOnly, masterInvoiceController.markAsPaid);
routes.post('/master/invoices/:id/charge', authMiddleware, masterOnly, masterInvoiceController.generateCharge);

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

routes.use('/properties', authMiddleware, checkSubscription);
routes.use('/contracts', authMiddleware, checkSubscription);
routes.get('/keys', authMiddleware, checkSubscription, requireModule('keys'), keyController.list);

export default routes;