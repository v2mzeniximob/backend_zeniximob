import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { FocusNfeService } from '../services/FocusNfeService';
import crypto from 'crypto';

const prisma = new PrismaClient() as any;

export class FiscalController {
  // Extrai com segurança o ID da imobiliária logada a partir do token JWT
  private static getRealEstateId(req: Request): string {
    const user = (req as any).user;
    return String(
      (req as any).realEstateId ||
      user?.realEstateId ||
      user?.id ||
      ''
    );
  }

  // ==========================================
  // 1. ATUALIZAR CREDENCIAIS FOCUS NFE
  // Rota: PUT /my-store/fiscal-config
  // ==========================================
  async updateFiscalConfig(req: Request, res: Response) {
    try {
      const realEstateId = FiscalController.getRealEstateId(req);
      const { focusNfeToken, focusEnv, taxRegime } = req.body;

      const updated = await prisma.realEstate.update({
        where: { id: realEstateId },
        data: {
          focusNfeToken: focusNfeToken ? String(focusNfeToken).trim() : null,
          focusEnv: focusEnv || 'homologacao',
          taxRegime: taxRegime || 'Simples Nacional'
        }
      });

      return res.json({
        message: 'Configurações da Focus NFe atualizadas com sucesso!',
        focusEnv: updated.focusEnv,
        taxRegime: updated.taxRegime
      });
    } catch (error: any) {
      console.error('[Fiscal] Erro ao salvar config Focus NFe:', error);
      return res.status(500).json({ error: 'Erro ao salvar configurações fiscais.' });
    }
  }

  // ==========================================
  // 2. UPLOAD DO CERTIFICADO DIGITAL A1 (.PFX)
  // Rota: POST /my-store/certificate
  // ==========================================
  async uploadCertificate(req: Request, res: Response) {
    try {
      const realEstateId = FiscalController.getRealEstateId(req);
      const { password, expiresAt } = req.body;
      const file = req.file;

      if (!file) {
        return res.status(400).json({ error: 'Arquivo do certificado (.pfx) não enviado.' });
      }

      if (!password) {
        return res.status(400).json({ error: 'A senha do Certificado A1 é obrigatória.' });
      }

      const certPath = file.path || `/uploads/${file.filename}`;

      await prisma.realEstate.update({
        where: { id: realEstateId },
        data: {
          a1CertPath: certPath,
          a1CertPassword: String(password),
          a1CertExpiresAt: expiresAt ? new Date(expiresAt) : null
        }
      });

      return res.json({
        message: 'Certificado Digital A1 armazenado e vinculado com sucesso!',
        a1CertPath: certPath
      });
    } catch (error: any) {
      console.error('[Fiscal] Erro no upload do Certificado A1:', error);
      return res.status(500).json({ error: 'Erro interno ao salvar o Certificado A1.' });
    }
  }

  // ==========================================
  // 3. LISTAR REGRAS FISCAIS DA IMOBILIÁRIA
  // Rota: GET /tax-rules
  // ==========================================
  async listTaxRules(req: Request, res: Response) {
    try {
      const realEstateId = FiscalController.getRealEstateId(req);

      const rules = await prisma.taxRule.findMany({
        where: { realEstateId },
        orderBy: { createdAt: 'desc' }
      });

      return res.json(rules);
    } catch (error) {
      console.error('[Fiscal] Erro ao listar regras fiscais:', error);
      return res.status(500).json({ error: 'Erro ao carregar regras fiscais.' });
    }
  }

  // ==========================================
  // 4. CRIAR NOVA REGRA FISCAL
  // Rota: POST /tax-rules
  // ==========================================
  async createTaxRule(req: Request, res: Response) {
    try {
      const realEstateId = FiscalController.getRealEstateId(req);
      const {
        name,
        operationType,
        serviceCode,
        cnaeCode,
        issRate,
        pisRate,
        cofinsRate,
        csllRate,
        irRate,
        inssRate,
        retainIss,
        applyIbsCbs,
        ibsRate,
        cbsRate
      } = req.body;

      if (!name || !serviceCode) {
        return res.status(400).json({ error: 'Nome da regra e Código de Serviço (LC 116) são obrigatórios.' });
      }

      const rule = await prisma.taxRule.create({
        data: {
          realEstateId,
          name: String(name),
          operationType: operationType || 'AMBOS',
          serviceCode: String(serviceCode),
          cnaeCode: cnaeCode ? String(cnaeCode) : null,
          issRate: Number(issRate || 2.0),
          pisRate: Number(pisRate || 0.65),
          cofinsRate: Number(cofinsRate || 3.0),
          csllRate: Number(csllRate || 1.0),
          irRate: Number(irRate || 1.5),
          inssRate: Number(inssRate || 0.0),
          retainIss: Boolean(retainIss),
          applyIbsCbs: Boolean(applyIbsCbs),
          ibsRate: Number(ibsRate || 0.0),
          cbsRate: Number(cbsRate || 0.0)
        }
      });

      return res.status(201).json(rule);
    } catch (error) {
      console.error('[Fiscal] Erro ao criar regra fiscal:', error);
      return res.status(500).json({ error: 'Erro ao cadastrar regra fiscal.' });
    }
  }

  // ==========================================
  // 5. EXCLUIR REGRA FISCAL
  // Rota: DELETE /tax-rules/:id
  // ==========================================
  async deleteTaxRule(req: Request, res: Response) {
    try {
      const id = String(req.params.id);
      await prisma.taxRule.delete({ where: { id } });
      return res.json({ message: 'Regra fiscal removida com sucesso.' });
    } catch (error) {
      console.error('[Fiscal] Erro ao deletar regra fiscal:', error);
      return res.status(500).json({ error: 'Erro ao remover regra fiscal.' });
    }
  }

  // ==========================================
  // 6. VINCULAR REGRA FISCAL A UM CORRETOR
  // Rota: PATCH /brokers/:id/tax-rule
  // ==========================================
  async linkBrokerTaxRule(req: Request, res: Response) {
    try {
      const brokerId = String(req.params.id);
      const { taxRuleId, cnpj } = req.body;

      const updatedBroker = await prisma.broker.update({
        where: { id: brokerId },
        data: {
          taxRuleId: taxRuleId || null,
          ...(cnpj !== undefined ? { cnpj: String(cnpj) } : {})
        },
        include: { taxRule: true }
      });

      return res.json({
        message: 'Regra fiscal vinculada ao corretor com sucesso!',
        broker: updatedBroker
      });
    } catch (error) {
      console.error('[Fiscal] Erro ao vincular regra fiscal ao corretor:', error);
      return res.status(500).json({ error: 'Erro ao vincular regra fiscal ao corretor.' });
    }
  }

  // ==========================================
  // 7. LISTAR NOTAS FISCAIS DE REPASSE (CORRETORES)
  // Rota: GET /broker-invoices
  // ==========================================
  async listBrokerInvoices(req: Request, res: Response) {
    try {
      const realEstateId = FiscalController.getRealEstateId(req);

      const invoices = await prisma.brokerInvoice.findMany({
        where: { realEstateId },
        include: {
          broker: true,
          taxRule: true
        },
        orderBy: { createdAt: 'desc' }
      });

      return res.json(invoices);
    } catch (error) {
      console.error('[Fiscal] Erro ao listar notas de corretores:', error);
      return res.status(500).json({ error: 'Erro ao carregar notas de repasse.' });
    }
  }

  // ==========================================
  // 8. EMITIR NOTA FISCAL DE REPASSE / COMISSÃO (CORRETOR)
  // Rota: POST /broker-invoices/emit
  // ==========================================
  async emitBrokerInvoice(req: Request, res: Response) {
    try {
      const realEstateId = FiscalController.getRealEstateId(req);
      const { brokerId, taxRuleId, amount, description, commissionId } = req.body;

      if (!brokerId || !amount) {
        return res.status(400).json({ error: 'Corretor e Valor do Repasse são obrigatórios.' });
      }

      const store = await prisma.realEstate.findUnique({ where: { id: realEstateId } });
      if (!store) {
        return res.status(404).json({ error: 'Imobiliária não encontrada.' });
      }

      const broker = await prisma.broker.findUnique({ where: { id: String(brokerId) } });
      if (!broker) {
        return res.status(404).json({ error: 'Corretor não encontrado.' });
      }

      const effectiveRuleId = taxRuleId || broker.taxRuleId;
      const taxRule = effectiveRuleId
        ? await prisma.taxRule.findUnique({ where: { id: String(effectiveRuleId) } })
        : null;

      const focusRef = `REP_${crypto.randomBytes(6).toString('hex').toUpperCase()}`;
      const numericAmount = Number(amount);
      const serviceDescription =
        description ||
        `Nota Fiscal de Serviço referente a repasse de intermediação/corretagem imobiliária - Corretor: ${broker.name} (CRECI: ${broker.creci}).`;

      let status = 'ISSUED';
      let pdfUrl: string | null = null;
      let xmlUrl: string | null = null;
      let nfseNumber: string | null = null;

      // Se a imobiliária já configurou o Token da Focus NFe, transmite via API
      if (store.focusNfeToken) {
        const cleanDoc = (broker.cnpj || broker.cpf || '').replace(/\D/g, '');
        const nfsePayload = {
          data_emissao: new Date().toISOString(),
          prestador: {
            cnpj: store.cnpj.replace(/\D/g, ''),
            inscricao_municipal: store.cityRegistration || ''
          },
          tomador: {
            ...(cleanDoc.length === 14 ? { cnpj: cleanDoc } : { cpf: cleanDoc }),
            razao_social: broker.name,
            email: broker.email
          },
          servico: {
            aliquota: Number(taxRule?.issRate || 2.0),
            discriminacao: serviceDescription,
            iss_retido: Boolean(taxRule?.retainIss).toString(),
            item_lista_servico: taxRule?.serviceCode || '10.05',
            valor_servicos: numericAmount
          }
        };

        const focusResult = await FocusNfeService.emitNfse(
          { token: store.focusNfeToken, env: store.focusEnv || 'homologacao' },
          focusRef,
          nfsePayload
        );

        status = focusResult.status === 'erro_autorizacao' ? 'ERROR' : 'ISSUED';
        pdfUrl = focusResult.url_danfse || focusResult.caminho_danfse || null;
        xmlUrl = focusResult.caminho_xml_nota_fiscal || null;
        nfseNumber = focusResult.numero || null;
      }

      const brokerInvoice = await prisma.brokerInvoice.create({
        data: {
          realEstateId,
          brokerId: broker.id,
          taxRuleId: taxRule ? taxRule.id : null,
          commissionId: commissionId || null,
          amount: numericAmount,
          description: serviceDescription,
          status,
          focusRef,
          nfseNumber,
          pdfUrl,
          xmlUrl,
          issuedAt: new Date()
        },
        include: {
          broker: true,
          taxRule: true
        }
      });

      return res.status(201).json({
        message: store.focusNfeToken
          ? 'Nota Fiscal enviada e processada via Focus NFe!'
          : 'Registro de Nota de Repasse criado (Configure o Token Focus NFe para transmissão à prefeitura).',
        brokerInvoice
      });
    } catch (error: any) {
      console.error('[Fiscal] Erro ao emitir nota de corretor:', error);
      return res.status(500).json({ error: error.message || 'Erro ao emitir nota de repasse.' });
    }
  }

  // ==========================================
  // 9. EMITIR NFS-e SOBRE TAXA DE ADMINISTRAÇÃO DE ALUGUEL
  // (A imobiliária emite NFS-e exclusivamente sobre realEstateFee, não sobre o aluguel bruto)
  // Rota: POST /invoices/:id/emit-nfse
  // ==========================================
  async emitAdminFeeNfse(req: Request, res: Response) {
    try {
      const realEstateId = FiscalController.getRealEstateId(req);
      const invoiceId = String(req.params.id);
      const { taxRuleId } = req.body;

      const invoice = await prisma.invoice.findUnique({
        where: { id: invoiceId },
        include: {
          contract: {
            include: {
              property: {
                include: { owner: true }
              }
            }
          }
        }
      });

      if (!invoice) {
        return res.status(404).json({ error: 'Fatura de aluguel não encontrada.' });
      }

      const adminFee = Number(invoice.realEstateFee || 0);
      if (adminFee <= 0) {
        return res.status(400).json({
          error: 'Esta fatura não possui valor de Taxa de Administração (realEstateFee) para emissão de NFS-e.'
        });
      }

      const store = await prisma.realEstate.findUnique({ where: { id: realEstateId } });
      if (!store || !store.focusNfeToken) {
        return res.status(400).json({
          error: 'Configure o Token da Focus NFe no Módulo Fiscal antes de emitir a nota da Taxa de Administração.'
        });
      }

      const owner = invoice.contract?.property?.owner;
      const taxRule = taxRuleId
        ? await prisma.taxRule.findUnique({ where: { id: String(taxRuleId) } })
        : await prisma.taxRule.findFirst({ where: { realEstateId } });

      const focusRef = `ADM_${crypto.randomBytes(6).toString('hex').toUpperCase()}`;
      const cleanOwnerDoc = (owner?.cpfOrCnpj || '').replace(/\D/g, '');

      const nfsePayload = {
        data_emissao: new Date().toISOString(),
        prestador: {
          cnpj: store.cnpj.replace(/\D/g, ''),
          inscricao_municipal: store.cityRegistration || ''
        },
        tomador: {
          ...(cleanOwnerDoc.length === 14 ? { cnpj: cleanOwnerDoc } : { cpf: cleanOwnerDoc }),
          razao_social: owner?.name || 'Proprietário do Imóvel',
          email: owner?.email || undefined
        },
        servico: {
          aliquota: Number(taxRule?.issRate || 2.0),
          discriminacao: `Taxa de Administração de Locação Imobiliária ref. ao imóvel ${invoice.contract?.property?.title || ''}. (Valor exclusivo da comissão administrativa; não inclui valor bruto de aluguel repassado ao locador).`,
          iss_retido: Boolean(taxRule?.retainIss).toString(),
          item_lista_servico: taxRule?.serviceCode || '10.05',
          valor_servicos: adminFee
        }
      };

      const focusResult = await FocusNfeService.emitNfse(
        { token: store.focusNfeToken, env: store.focusEnv || 'homologacao' },
        focusRef,
        nfsePayload
      );

      const updatedInvoice = await prisma.invoice.update({
        where: { id: invoice.id },
        data: {
          nfseStatus: focusResult.status === 'erro_autorizacao' ? 'ERROR' : 'ISSUED',
          nfseFocusRef: focusRef,
          nfsePdfUrl: focusResult.url_danfse || focusResult.caminho_danfse || null,
          nfseXmlUrl: focusResult.caminho_xml_nota_fiscal || null
        }
      });

      return res.json({
        message: 'NFS-e sobre a Taxa de Administração emitida com sucesso!',
        invoice: updatedInvoice
      });
    } catch (error: any) {
      console.error('[Fiscal] Erro ao emitir NFS-e da Taxa de Administração:', error);
      return res.status(500).json({ error: error.message || 'Erro ao emitir NFS-e da taxa de administração.' });
    }
  }
}