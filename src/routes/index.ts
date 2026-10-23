import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { AuthController } from '../controllers/AuthController';
import { PlanController } from '../controllers/PlanController';
import { FranchiseeController } from '../controllers/FranchiseeController';
import { IntegrationController } from '../controllers/IntegrationController';
import { RealEstateController } from '../controllers/RealEstateController';
import { DashboardController } from '../controllers/DashboardController';
import { PropertyController } from '../controllers/PropertyController';
import { LeadController, pickNextBrokerInRoulette } from '../controllers/LeadController';
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
import { DealController } from '../controllers/DealController';
import { DimobController } from '../controllers/DimobController';
import { InspectionController } from '../controllers/InspectionController';
import { WhatsappController } from '../controllers/WhatsappController';
import { WebhookController } from '../controllers/WebhookController';
import { ValuationController } from '../controllers/ValuationController';
import { SeasonIcalController } from '../controllers/SeasonIcalController';
import { FiscalController } from '../controllers/FiscalController';
import { MetaLeadController } from '../controllers/MetaLeadController';
import { FinanceExpenseController } from '../controllers/FinanceExpenseController';
import { IncorporadoraController } from '../controllers/IncorporadoraController';

import { upload } from '../middlewares/upload';
import { ClientPortalController } from '../controllers/ClientPortalController';

const routes = Router();
const prisma = new PrismaClient() as any;

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
const dimobController = new DimobController();
const inspectionController = new InspectionController();
const whatsappController = new WhatsappController();
const webhookController = new WebhookController();
const valuationController = new ValuationController();
const seasonIcalController = new SeasonIcalController();
const fiscalController = new FiscalController();
const metaLeadController = new MetaLeadController();
const financeExpenseController = new FinanceExpenseController();
const incorporadoraController = new IncorporadoraController();

// ==========================================
// ROTAS PÚBLICAS
// ==========================================
routes.post('/login', authController.login);
routes.post('/portal/login', clientPortalController.login);

routes.post('/portal/condo/reservations', authMiddleware, portalOnly, clientPortalController.createReservation);

// Rotas públicas da Landing Page (Site Master) e Planos Ativos
routes.get('/public/landing-page', masterConfigController.getLandingPagePublic);

routes.get('/public/stores/:slug', propertyController.listPublicByStore);
routes.get('/public/stores/:slug/properties/:propertyId', propertyController.getPublicProperty);
routes.get('/public/xml/:slug', xmlController.generateFeed);

// Rotas Públicas da Incorporadora (Vitrine e Simulador de Financiamento no Site e Painel)
routes.get('/public/stores/:slug/incorporadora', incorporadoraController.getPublicDeveloperShowcase);
routes.get('/public/stores/:slug/incorporadoras', incorporadoraController.getPublicDeveloperShowcase);
routes.post('/incorporadora/simulate-financing', incorporadoraController.simulateFinancingAndSalesTable);
routes.post('/incorporadoras/simulate-financing', incorporadoraController.simulateFinancingAndSalesTable);

// Rota pública para Airbnb e Booking.com baixarem o nosso iCal
routes.get('/public/properties/:propertyId/ical/:token.ics', seasonIcalController.exportIcal);

// Webhook para receber leads do Instagram / Facebook Lead Ads
routes.post('/webhook/meta-leads/:realEstateId', metaLeadController.receiveMetaLead);

// Rota pública para Motor de Reservas Diretas (Criar Reserva de Temporada)
routes.post('/public/season-bookings', async (req, res) => {
  try {
    const { propertyId, guestName, guestPhone, guestEmail, checkIn, checkOut, totalAmount, notes } = req.body;
    
    if (!propertyId || !checkIn || !checkOut) {
      return res.status(400).json({ error: 'Imóvel, Check-in e Check-out são obrigatórios.' });
    }

    const booking = await prisma.seasonBooking.create({
      data: {
        propertyId,
        guestName: guestName || 'Hóspede Direto',
        guestPhone,
        guestEmail,
        checkIn: new Date(checkIn),
        checkOut: new Date(checkOut),
        source: 'DIRECT',
        totalAmount: totalAmount ? Number(totalAmount) : null,
        status: 'CONFIRMED',
        notes: notes || 'Reserva Direta pelo Site'
      }
    });

    return res.status(201).json({ message: 'Reserva realizada com sucesso!', booking });
  } catch (error) {
    console.error('Erro ao criar reserva direta de temporada:', error);
    return res.status(500).json({ error: 'Erro ao processar reserva.' });
  }
});

routes.post('/public/leads', async (req, res) => {
  try {
    const { name, phone, email, interest, status, notes, propertyId, realEstateId, brokerId } = req.body;

    let finalBrokerId = brokerId || null;
    let assignedViaRouletteName: string | null = null;

    if (!finalBrokerId && realEstateId) {
      const store = await prisma.realEstate.findUnique({
        where: { id: realEstateId },
        select: { rouletteEnabled: true }
      }).catch(() => null);

      if (store?.rouletteEnabled) {
        const picked = await pickNextBrokerInRoulette(realEstateId);
        if (picked) {
          finalBrokerId = picked.id;
          assignedViaRouletteName = picked.name;
        }
      }
    }

    const lead = await prisma.lead.create({
      data: {
        name,
        phone,
        email,
        interest: interest || 'Geral',
        status: status || 'Novo',
        stage: 'Novo',
        notes,
        propertyId: propertyId || null,
        brokerId: finalBrokerId,
        assignedAt: new Date(),
        firstContactAt: null,
        reassignedCount: 0,
        realEstateId
      }
    });

    await prisma.leadHistory.create({
      data: {
        leadId: lead.id,
        actionType: 'Sistema',
        description: assignedViaRouletteName
          ? `🌐 Lead recebido pelo Site Oficial e distribuído pela Roleta para: ${assignedViaRouletteName}.`
          : '🌐 Lead recebido através do Site Oficial.'
      }
    }).catch(() => {});

    return res.status(201).json(lead);
  } catch (error) {
    console.error('Erro ao registar lead público:', error);
    return res.status(500).json({ error: 'Erro ao registar mensagem do cliente.' });
  }
});

// ==========================================
// ROTAS PÚBLICAS: LISTAR CORRETORES DE UMA IMOBILIÁRIA (Para Vitrine Pública e Roleta de Leads)
// ==========================================
routes.get('/public/stores/:slug/brokers', async (req, res) => {
  try {
    const slug = String(req.params.slug);
    const store = await prisma.realEstate.findUnique({
      where: { slug },
      include: {
        brokers: {
          where: { isActive: true },
          orderBy: { name: 'asc' }
        }
      }
    });
    if (!store) return res.status(404).json({ error: 'Imobiliária não encontrada.' });
    return res.json({ realEstate: store, brokers: store.brokers || [] });
  } catch (error) {
    return res.status(500).json({ error: 'Erro ao listar corretores.' });
  }
});

// ==========================================
// WEBHOOKS PÚBLICOS 
// ==========================================
routes.post('/webhook/whatsapp/:instanceName', webhookController.receive);

// ==========================================
// ROTAS DO PORTAL DO CLIENTE (Inquilino / Proprietário)
// ==========================================
routes.get('/portal/dashboard', authMiddleware, portalOnly, clientPortalController.getDashboard);
routes.post('/portal/tickets', authMiddleware, portalOnly, ticketController.create);
routes.post('/portal/tickets/:id/messages', authMiddleware, portalOnly, ticketController.addMessage);

// Rotas da Incorporadora no Portal do Cliente
routes.get('/portal/incorporadora', authMiddleware, portalOnly, incorporadoraController.getPortalDeveloperData);
routes.get('/portal/incorporadoras', authMiddleware, portalOnly, incorporadoraController.getPortalDeveloperData);
routes.post('/portal/incorporadora/:projectId/custom-order', authMiddleware, portalOnly, incorporadoraController.createPortalCustomizationOrder);
routes.post('/portal/incorporadoras/:projectId/custom-order', authMiddleware, portalOnly, incorporadoraController.createPortalCustomizationOrder);

// ==========================================
// ROTAS DE ALUGUEL POR TEMPORADA (PMS & iCal)
// ==========================================
routes.put('/properties/:id/ical-links', authMiddleware, seasonIcalController.updateIcalLinks);

routes.get('/properties/:propertyId/season-bookings', authMiddleware, async (req, res) => {
  try {
    const propertyId = String(req.params.propertyId);
    const bookings = await prisma.seasonBooking.findMany({
      where: { propertyId },
      orderBy: { checkIn: 'desc' }
    });
    return res.json(bookings);
  } catch (error) {
    console.error('Erro ao procurar reservas de temporada:', error);
    return res.status(500).json({ error: 'Erro ao carregar reservas.' });
  }
});

// ==========================================
// ROTAS DO MÓDULO FISCAL & FOCUS NFE
// ==========================================
routes.put('/my-store/fiscal-config', authMiddleware, fiscalController.updateFiscalConfig);
routes.post('/my-store/certificate', authMiddleware, upload.single('certificate'), fiscalController.uploadCertificate);

routes.get('/tax-rules', authMiddleware, fiscalController.listTaxRules);
routes.post('/tax-rules', authMiddleware, fiscalController.createTaxRule);
routes.delete('/tax-rules/:id', authMiddleware, fiscalController.deleteTaxRule);

routes.patch('/brokers/:id/tax-rule', authMiddleware, fiscalController.linkBrokerTaxRule);
routes.get('/broker-invoices', authMiddleware, fiscalController.listBrokerInvoices);
routes.post('/broker-invoices/emit', authMiddleware, fiscalController.emitBrokerInvoice);

routes.post('/invoices/:id/emit-nfse', authMiddleware, fiscalController.emitAdminFeeNfse);

// ==========================================
// ROTAS DE DESPESAS DE CONTRATO & CONTAS A PAGAR (CONTA AZUL)
// ==========================================
routes.post('/property-expenses', authMiddleware, financeExpenseController.createPropertyExpense);
routes.get('/property-expenses', authMiddleware, financeExpenseController.listPropertyExpenses);
routes.post('/agency-expenses', authMiddleware, financeExpenseController.createAgencyExpense);
routes.get('/agency-expenses', authMiddleware, financeExpenseController.listAgencyExpenses);
routes.post('/conta-azul/emit-boleto', authMiddleware, financeExpenseController.emitContaAzulBoleto);

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

// ==========================================
// MÓDULO DE CONDOMÍNIOS & ADMINISTRAÇÃO
// ==========================================
routes.post('/condominiums', authMiddleware, condominiumController.create);
routes.get('/condominiums', authMiddleware, condominiumController.list);
routes.put('/condominiums/:id', authMiddleware, condominiumController.update);
routes.patch('/condominiums/:id/status', authMiddleware, condominiumController.toggleStatus);

// Unidades
routes.post('/condominiums/:condominiumId/units', authMiddleware, condominiumController.createUnit);
routes.get('/condominiums/:condominiumId/units', authMiddleware, condominiumController.listUnits);
routes.put('/condominiums/units/:unitId', authMiddleware, condominiumController.updateUnit);

// Despesas do Condomínio
routes.post('/condominiums/:condominiumId/expenses', authMiddleware, condominiumController.createExpense);
routes.get('/condominiums/:condominiumId/expenses', authMiddleware, condominiumController.listExpenses);
routes.put('/condominiums/expenses/:expenseId', authMiddleware, condominiumController.updateExpense);

// Boletos & Rateios
routes.post('/condominiums/:condominiumId/bills/generate', authMiddleware, condominiumController.generateMonthlyBills);
routes.get('/condominiums/:condominiumId/bills', authMiddleware, condominiumController.listBills);
routes.patch('/condominiums/bills/:billId/pay', authMiddleware, condominiumController.markBillAsPaid);

// Consumo por IA (Água, Gás, Energia)
routes.post('/condominiums/:condominiumId/consumption', authMiddleware, condominiumController.createConsumptionReading);
routes.get('/condominiums/:condominiumId/consumption', authMiddleware, condominiumController.listConsumptionReadings);

// Acordos de Inadimplência
routes.post('/condominiums/:condominiumId/agreements', authMiddleware, condominiumController.createAgreement);

// Configurações de Juros e Multas
routes.get('/condominiums/:condominiumId/settings', authMiddleware, condominiumController.getSettings);
routes.put('/condominiums/:condominiumId/settings', authMiddleware, condominiumController.updateSettings);

// Áreas Comuns e Reservas
routes.post('/condominiums/:condominiumId/reservations', authMiddleware, condominiumController.createReservation);
routes.get('/condominiums/:condominiumId/reservations', authMiddleware, condominiumController.listReservations);

// Ocorrências
routes.post('/condominiums/:condominiumId/occurrences', authMiddleware, condominiumController.createOccurrence);
routes.get('/condominiums/:condominiumId/occurrences', authMiddleware, condominiumController.listOccurrences);

// Reuniões & Assembleias (Atas)
routes.post('/condominiums/:condominiumId/assemblies', authMiddleware, condominiumController.createAssembly);
routes.get('/condominiums/:condominiumId/assemblies', authMiddleware, condominiumController.listAssemblies);

routes.put('/condominiums/bills/:billId', authMiddleware, condominiumController.updateBill);
routes.put('/condominiums/consumption/:readingId', authMiddleware, condominiumController.updateConsumptionReading);

routes.get('/properties/public/:slug', propertyController.listPublicByStore);
routes.get('/properties', authMiddleware, propertyController.list);
routes.post('/properties', authMiddleware, propertyController.create);
routes.put('/properties/:id', authMiddleware, propertyController.update);
routes.patch('/properties/:id/status', authMiddleware, propertyController.toggleStatus);
routes.put('/properties/:id/rental', authMiddleware, propertyController.updateRentalInfo);

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
routes.post('/keys/withdraw', authMiddleware, keyController.withdraw);
routes.patch('/keys/:id/code', authMiddleware, keyController.updateKeyCode);
routes.patch('/keys/:movementId/return', authMiddleware, keyController.returnKey);

routes.post('/insurance-companies', authMiddleware, insuranceCompanyController.create);
routes.get('/insurance-companies', authMiddleware, insuranceCompanyController.list);
routes.patch('/insurance-companies/:id/status', authMiddleware, insuranceCompanyController.toggleStatus);

routes.get('/contracts', authMiddleware, contractController.list);
routes.post('/contracts', authMiddleware, contractController.create);
routes.put('/contracts/:id', authMiddleware, contractController.update);
routes.delete('/contracts/:id', authMiddleware, contractController.delete);

routes.post('/contracts/:id/upload', authMiddleware, upload.single('file'), signatureController.uploadTenantContract);
routes.post('/owners/:id/upload', authMiddleware, upload.single('file'), signatureController.uploadOwnerContract);

// ==========================================
// ROTAS DE LEADS & ROLETA (Rotas fixas ANTES de :id)
// ==========================================
routes.get('/leads/roulette/settings', authMiddleware, leadController.getRouletteSettings);
routes.put('/leads/roulette/settings', authMiddleware, leadController.updateRouletteSettings);
routes.get('/leads', authMiddleware, leadController.list);
routes.post('/leads', authMiddleware, leadController.create);
routes.put('/leads/:id', authMiddleware, leadController.update);
routes.post('/leads/:id/history', authMiddleware, leadController.addHistoryEvent);
routes.get('/leads/:id/matches', authMiddleware, leadController.getMatches);

// ==========================================
// ESTEIRA DE VENDAS E LOCAÇÃO (KANBAN)
// ==========================================
routes.get('/deals/stages', authMiddleware, dealController.listStages);
routes.post('/deals/stages', authMiddleware, dealController.createStage);
routes.post('/deals', authMiddleware, dealController.createDeal);
routes.put('/deals/:id', authMiddleware, dealController.updateDeal);
routes.patch('/deals/:id/move', authMiddleware, dealController.moveDeal);
routes.delete('/deals/:id', authMiddleware, dealController.deleteDeal);
routes.get('/deals/:id', authMiddleware, dealController.getDealDetails);

// ==========================================
// ROTAS DE CORRETORES & RATEIO (Rotas fixas ANTES de :id)
// ==========================================
routes.get('/brokers/split-settings', authMiddleware, brokerController.getSplitSettings);
routes.put('/brokers/split-settings', authMiddleware, brokerController.updateSplitSettings);
routes.get('/brokers/reports/commissions', authMiddleware, brokerController.getCommissionReport);
routes.get('/brokers', authMiddleware, brokerController.list);
routes.post('/brokers', authMiddleware, brokerController.create);
routes.put('/brokers/:id', authMiddleware, brokerController.update);
routes.patch('/brokers/:id/status', authMiddleware, brokerController.toggleStatus);
routes.patch('/brokers/:id/roulette', authMiddleware, brokerController.toggleRoulette);

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

// ==========================================
// ROTAS DO AVALIADOR DE IMÓVEIS (PTAM / ACM)
// ==========================================
routes.get('/valuations/comparables', authMiddleware, valuationController.findComparables);
routes.get('/valuations', authMiddleware, valuationController.list);
routes.post('/valuations', authMiddleware, valuationController.create);
routes.delete('/valuations/:id', authMiddleware, valuationController.delete);

// ==========================================
// ROTAS WHATSAPP & ROBÔ IA
// ==========================================
routes.get('/whatsapp/status', authMiddleware, whatsappController.getStatus);
routes.post('/whatsapp/connect', authMiddleware, whatsappController.connect);
routes.post('/whatsapp/disconnect', authMiddleware, whatsappController.disconnect);
routes.put('/whatsapp/settings', authMiddleware, whatsappController.updateSettings);

// ==========================================
// ROTAS DE VISTORIAS (INSPECTIONS)
// ==========================================
routes.post('/contracts/:contractId/inspections', authMiddleware, inspectionController.create);
routes.put('/inspections/:id', authMiddleware, inspectionController.update);
routes.delete('/inspections/:id', authMiddleware, inspectionController.delete);

routes.post('/ai/generate-description', authMiddleware, aiController.generateDescription);

routes.post('/tickets', authMiddleware, ticketController.create);
routes.get('/tickets', authMiddleware, ticketController.list);
routes.patch('/tickets/:id/status', authMiddleware, ticketController.updateStatus);
routes.post('/tickets/:id/messages', authMiddleware, ticketController.addMessage);

routes.get('/dimob/summary', authMiddleware, dimobController.getSummary);
routes.get('/dimob/export', authMiddleware, dimobController.exportTxt);

// ==========================================
// ROTAS PROTEGIDAS: MÓDULO INCORPORADORA (Suporte /incorporadora e /incorporadoras)
// ==========================================
const incorpPrefixes = ['/incorporadora', '/incorporadoras'];

for (const prefix of incorpPrefixes) {
  // 1. SPEs
  routes.get(`${prefix}/spes`, authMiddleware, incorporadoraController.listSpes);
  routes.post(`${prefix}/spes`, authMiddleware, incorporadoraController.createSpe);
  routes.put(`${prefix}/spes/:id`, authMiddleware, incorporadoraController.updateSpe);
  routes.patch(`${prefix}/spes/:id/status`, authMiddleware, incorporadoraController.updateSpe);

  // 2. Land Bank (Banco de Terrenos)
  routes.get(`${prefix}/land-bank`, authMiddleware, incorporadoraController.listLandBank);
  routes.post(`${prefix}/land-bank`, authMiddleware, incorporadoraController.createLandBankWithFeasibility);
  routes.put(`${prefix}/land-bank/:id`, authMiddleware, incorporadoraController.updateLandBank);
  routes.patch(`${prefix}/land-bank/:id/status`, authMiddleware, incorporadoraController.updateLandBank);

  // 3. Empreendimentos / Obras
  routes.get(`${prefix}/projects`, authMiddleware, incorporadoraController.listProjects);
  routes.post(`${prefix}/projects`, authMiddleware, incorporadoraController.createProject);
  routes.put(`${prefix}/projects/:id`, authMiddleware, incorporadoraController.updateProjectProgressAndSite);

  // 4. Orçamento & Curva ABC
  routes.post(`${prefix}/projects/:projectId/budget-items`, authMiddleware, incorporadoraController.addBudgetItemAndRecalculateAbc);
  routes.put(`${prefix}/budget-items/:itemId`, authMiddleware, incorporadoraController.updateBudgetItem);
  routes.delete(`${prefix}/budget-items/:itemId`, authMiddleware, incorporadoraController.deleteBudgetItem);

  // 5. Medições de Empreiteiros
  routes.post(`${prefix}/projects/:projectId/measurements`, authMiddleware, incorporadoraController.createMeasurement);
  routes.put(`${prefix}/measurements/:measurementId`, authMiddleware, incorporadoraController.updateMeasurement);
  routes.delete(`${prefix}/measurements/:measurementId`, authMiddleware, incorporadoraController.deleteMeasurement);

  // 6. Suprimentos & Compras
  routes.post(`${prefix}/projects/:projectId/supply-orders`, authMiddleware, incorporadoraController.createSupplyOrder);
  routes.put(`${prefix}/supply-orders/:supplyId`, authMiddleware, incorporadoraController.updateSupplyOrder);
  routes.delete(`${prefix}/supply-orders/:supplyId`, authMiddleware, incorporadoraController.deleteSupplyOrder);

  // 7. Diário de Obra (RDO)
  routes.post(`${prefix}/projects/:projectId/work-diaries`, authMiddleware, incorporadoraController.createWorkDiary);
  routes.put(`${prefix}/work-diaries/:diaryId`, authMiddleware, incorporadoraController.updateWorkDiary);
  routes.delete(`${prefix}/work-diaries/:diaryId`, authMiddleware, incorporadoraController.deleteWorkDiary);

  // 8. Arquivos BIM & Plantas
  routes.post(`${prefix}/projects/:projectId/bim-files`, authMiddleware, incorporadoraController.addBimFile);
  routes.put(`${prefix}/bim-files/:bimId`, authMiddleware, incorporadoraController.updateBimFile);
  routes.delete(`${prefix}/bim-files/:bimId`, authMiddleware, incorporadoraController.deleteBimFile);

  // 9. Kits de Personalização & Ordens de Customização
  routes.post(`${prefix}/projects/:projectId/customization-options`, authMiddleware, incorporadoraController.createCustomizationOption);
  routes.put(`${prefix}/customization-options/:optionId`, authMiddleware, incorporadoraController.updateCustomizationOption);
  routes.delete(`${prefix}/customization-options/:optionId`, authMiddleware, incorporadoraController.deleteCustomizationOption);

  routes.post(`${prefix}/projects/:projectId/customization-orders`, authMiddleware, incorporadoraController.createUnitCustomizationOrder);
  routes.post(`${prefix}/projects/:projectId/apply-incc`, authMiddleware, incorporadoraController.applyInccReadjustment);
}

// ==========================================
// ROTAS RESTRITAS (Apenas MASTER)
// ==========================================
routes.put('/master/landing-page', authMiddleware, masterOnly, masterConfigController.updateLandingPage);
routes.put('/master/admins/:id', authMiddleware, masterOnly, masterConfigController.updateAdmin);

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