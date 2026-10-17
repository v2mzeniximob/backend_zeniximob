import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient() as any;

export class IncorporadoraController {

  // =========================================================================
  // 1. GESTÃO DE MÚLTIPLAS EMPRESAS (SPEs) & LAND BANK (VIABILIDADE)
  // =========================================================================
  async listSpes(req: Request, res: Response) {
    try {
      const realEstateId = (req as any).user.realEstateId;
      const spes = await prisma.developerSpe.findMany({
        where: { realEstateId },
        include: { projects: true, landBanks: true },
        orderBy: { createdAt: 'desc' }
      });
      return res.json(spes);
    } catch (error) {
      return res.status(500).json({ error: 'Erro ao listar SPEs.' });
    }
  }

  async createSpe(req: Request, res: Response) {
    try {
      const realEstateId = (req as any).user.realEstateId;
      const { cnpj, corporateName, tradeName, taxRegime, bankName, bankAgency, bankAccount, pixKey } = req.body;

      const spe = await prisma.developerSpe.create({
        data: {
          realEstateId,
          cnpj: String(cnpj).replace(/\D/g, ''),
          corporateName,
          tradeName,
          taxRegime: taxRegime || 'RET - Patrimônio de Afetação',
          bankName,
          bankAgency,
          bankAccount,
          pixKey
        }
      });
      return res.status(201).json(spe);
    } catch (error: any) {
      return res.status(400).json({ error: 'Erro ao cadastrar SPE. Verifique se o CNPJ já existe.' });
    }
  }

  async listLandBank(req: Request, res: Response) {
    try {
      const realEstateId = (req as any).user.realEstateId;
      const lands = await prisma.landBank.findMany({
        where: { realEstateId },
        include: { spe: true },
        orderBy: { createdAt: 'desc' }
      });
      return res.json(lands);
    } catch (error) {
      return res.status(500).json({ error: 'Erro ao listar Land Bank.' });
    }
  }

  async createLandBankWithFeasibility(req: Request, res: Response) {
    try {
      const realEstateId = (req as any).user.realEstateId;
      const data = req.body;

      const areaSqm = Number(data.areaSqm || 0);
      const ca = Number(data.utilizationCoefficient || 1);
      const buildableAreaSqm = areaSqm * ca;

      const vgv = Number(data.estimatedVgv || 0);
      const acquisition = Number(data.acquisitionCost || 0);
      const construction = Number(data.estimatedConstructionCost || 0);
      const taxPct = Number(data.taxEstimatePercent ?? 4.0);
      const defaultRiskPct = Number(data.defaultRiskPercent ?? 3.5);

      const taxesValue = vgv * (taxPct / 100);
      const defaultProvision = vgv * (defaultRiskPct / 100);
      const netProfit = vgv - acquisition - construction - taxesValue - defaultProvision;
      const projectedMarginPercent = vgv > 0 ? Number(((netProfit / vgv) * 100).toFixed(2)) : 0;

      const land = await prisma.landBank.create({
        data: {
          realEstateId,
          speId: data.speId || null,
          title: data.title,
          cep: data.cep,
          address: data.address,
          neighborhood: data.neighborhood,
          city: data.city,
          state: data.state,
          areaSqm,
          utilizationCoefficient: ca,
          buildableAreaSqm,
          acquisitionCost: acquisition,
          swapPercent: Number(data.swapPercent || 0),
          estimatedVgv: vgv,
          estimatedConstructionCost: construction,
          taxEstimatePercent: taxPct,
          defaultRiskPercent: defaultRiskPct,
          projectedMarginPercent,
          cashFlowProjectionJson: data.cashFlowProjectionJson || {
            vgvBruto: vgv,
            impostosRET: taxesValue,
            provisaoInadimplencia: defaultProvision,
            custoTerreno: acquisition,
            custoObra: construction,
            resultadoLiquidoProjetado: netProfit
          },
          documentsJson: data.documentsJson || [],
          status: data.status || 'EM_ESTUDO',
          notes: data.notes
        }
      });

      return res.status(201).json(land);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao registrar terreno e estudo de viabilidade.' });
    }
  }

  // =========================================================================
  // 2. GESTÃO DE EMPREENDIMENTOS, ENGENHARIA, CURVA ABC E DIÁRIO DE OBRA
  // =========================================================================
  async listProjects(req: Request, res: Response) {
    try {
      const realEstateId = (req as any).user.realEstateId;
      const projects = await prisma.developmentProject.findMany({
        where: { realEstateId },
        include: {
          spe: true,
          landBank: true,
          budgetItems: { orderBy: { totalPlannedCost: 'desc' } },
          measurements: { orderBy: { measuredAt: 'desc' } },
          supplyOrders: { orderBy: { createdAt: 'desc' } },
          workDiaries: { orderBy: { date: 'desc' } },
          bimFiles: { orderBy: { createdAt: 'desc' } },
          customizationOptions: true,
          customizationOrders: { orderBy: { createdAt: 'desc' } }
        },
        orderBy: { createdAt: 'desc' }
      });
      return res.json(projects);
    } catch (error) {
      return res.status(500).json({ error: 'Erro ao listar empreendimentos.' });
    }
  }

  async createProject(req: Request, res: Response) {
    try {
      const realEstateId = (req as any).user.realEstateId;
      const d = req.body;

      const baseSlug = (d.slug || d.name || 'empreendimento')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '');

      const project = await prisma.developmentProject.create({
        data: {
          realEstateId,
          speId: d.speId || null,
          landBankId: d.landBankId || null,
          name: d.name,
          slug: `${baseSlug}-${Math.floor(100 + Math.random() * 900)}`,
          status: d.status || 'LANCAMENTO',
          description: d.description,
          address: d.address,
          neighborhood: d.neighborhood,
          city: d.city,
          state: d.state,
          deliveryForecast: d.deliveryForecast ? new Date(d.deliveryForecast) : null,
          totalUnits: Number(d.totalUnits || 1),
          vgvTotal: Number(d.vgvTotal || 0),
          tour360ExteriorUrl: d.tour360ExteriorUrl || null,
          tour360DecoratedUrl: d.tour360DecoratedUrl || null,
          facadeRendersUrls: Array.isArray(d.facadeRendersUrls) ? d.facadeRendersUrls : [],
          interiorRendersUrls: Array.isArray(d.interiorRendersUrls) ? d.interiorRendersUrls : [],
          floorPlansUrls: Array.isArray(d.floorPlansUrls) ? d.floorPlansUrls : [],
          visualMemorialJson: d.visualMemorialJson || [],
          showOnPublicSite: d.showOnPublicSite !== false,
          customHeadline: d.customHeadline || d.name,
          heroVideoUrl: d.heroVideoUrl || null,
          primaryThemeColor: d.primaryThemeColor || '#0f172a',
          accentThemeColor: d.accentThemeColor || '#2563eb',
          highlightsJson: d.highlightsJson || []
        }
      });

      return res.status(201).json(project);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao criar empreendimento.' });
    }
  }

  async updateProjectProgressAndSite(req: Request, res: Response) {
    try {
      const id = String(req.params.id);
      const d = req.body;

      const foundation = Number(d.foundationPct ?? 0);
      const structure = Number(d.structurePct ?? 0);
      const masonry = Number(d.masonryPct ?? 0);
      const installations = Number(d.installationsPct ?? 0);
      const facade = Number(d.facadePct ?? 0);
      const finishing = Number(d.finishingPct ?? 0);

      const overallProgressPct = Number(
        ((foundation + structure + masonry + installations + facade + finishing) / 6).toFixed(1)
      );

      const updated = await prisma.developmentProject.update({
        where: { id },
        data: {
          ...d,
          foundationPct: foundation,
          structurePct: structure,
          masonryPct: masonry,
          installationsPct: installations,
          facadePct: facade,
          finishingPct: finishing,
          overallProgressPct
        }
      });

      return res.json(updated);
    } catch (error) {
      return res.status(500).json({ error: 'Erro ao atualizar cronograma e vitrine do empreendimento.' });
    }
  }

  // Adição de Item de Orçamento + Recálculo Automático da Curva ABC
  async addBudgetItemAndRecalculateAbc(req: Request, res: Response) {
    try {
      const projectId = String(req.params.projectId);
      const { code, stageName, itemDescription, category, unit, quantity, unitCost, plannedStartDate, plannedEndDate } = req.body;

      const qty = Number(quantity || 1);
      const cost = Number(unitCost || 0);
      const totalPlannedCost = qty * cost;

      await prisma.constructionBudgetItem.create({
        data: {
          projectId,
          code,
          stageName,
          itemDescription,
          category: category || 'Material',
          unit: unit || 'un',
          quantity: qty,
          unitCost: cost,
          totalPlannedCost,
          plannedStartDate: plannedStartDate ? new Date(plannedStartDate) : null,
          plannedEndDate: plannedEndDate ? new Date(plannedEndDate) : null
        }
      });

      // Recalcula a Curva ABC de todo o orçamento da obra (A = até 80%, B = 80% a 95%, C = 95% a 100%)
      const allItems = await prisma.constructionBudgetItem.findMany({
        where: { projectId },
        orderBy: { totalPlannedCost: 'desc' }
      });

      const grandTotal = allItems.reduce((acc: number, item: any) => acc + item.totalPlannedCost, 0);
      let cumulative = 0;

      for (const item of allItems) {
        cumulative += item.totalPlannedCost;
        const pct = grandTotal > 0 ? (cumulative / grandTotal) * 100 : 100;
        const abcClass = pct <= 80 ? 'A' : pct <= 95 ? 'B' : 'C';

        await prisma.constructionBudgetItem.update({
          where: { id: item.id },
          data: { abcClass }
        });
      }

      return res.status(201).json({ message: 'Insumo adicionado e Curva ABC recalculada!' });
    } catch (error) {
      return res.status(500).json({ error: 'Erro ao adicionar item na Curva ABC.' });
    }
  }

  // Medição de Empreiteiros com Retenção Contratual + Lançamento no DRE
  async createMeasurement(req: Request, res: Response) {
    try {
      const realEstateId = (req as any).user.realEstateId;
      const projectId = String(req.params.projectId);
      const { contractorName, contractorCnpj, serviceDescription, periodReference, grossAmount, retentionPercent, integrateToDre } = req.body;

      const gross = Number(grossAmount || 0);
      const retPct = Number(retentionPercent ?? 5);
      const retentionAmount = Number((gross * (retPct / 100)).toFixed(2));
      const netAmount = Number((gross - retentionAmount).toFixed(2));

      const measurement = await prisma.contractorMeasurement.create({
        data: {
          projectId,
          contractorName,
          contractorCnpj,
          serviceDescription,
          periodReference,
          grossAmount: gross,
          retentionPercent: retPct,
          retentionAmount,
          netAmount,
          status: integrateToDre ? 'PAGA_INTEGRADA_DRE' : 'APROVADA'
        }
      });

      if (integrateToDre) {
        await prisma.agencyExpense.create({
          data: {
            realEstateId,
            description: `[Obra Medição] ${serviceDescription} - ${contractorName} (Retenção: R$ ${retentionAmount})`,
            amount: netAmount,
            dueDate: new Date(),
            paidDate: new Date(),
            status: 'Pago',
            category: 'Engenharia / Obras',
            supplierName: contractorName
          }
        });
      }

      return res.status(201).json(measurement);
    } catch (error) {
      return res.status(500).json({ error: 'Erro ao registrar medição de empreiteiro.' });
    }
  }

  // Suprimentos, Compras e Controle de Estoque no Canteiro
  async createSupplyOrder(req: Request, res: Response) {
    try {
      const projectId = String(req.params.projectId);
      const { materialName, unit, quantityOrdered, supplierName, totalAmount, quotesJson, status } = req.body;

      const qty = Number(quantityOrdered || 0);
      const order = await prisma.supplyPurchaseOrder.create({
        data: {
          projectId,
          materialName,
          unit: unit || 'un',
          quantityOrdered: qty,
          quantityInStock: status === 'ENTREGUE_NO_CANTEIRO' ? qty : 0,
          supplierName,
          totalAmount: Number(totalAmount || 0),
          quotesJson: quotesJson || [],
          status: status || 'ORDEM_EMITIDA'
        }
      });
      return res.status(201).json(order);
    } catch (error) {
      return res.status(500).json({ error: 'Erro ao criar ordem de compra.' });
    }
  }

  // Diário de Obra (RDO)
  async createWorkDiary(req: Request, res: Response) {
    try {
      const projectId = String(req.params.projectId);
      const { weatherMorning, weatherAfternoon, workforceCount, activitiesExecuted, occurrences, photosUrls, engineerName } = req.body;

      const diary = await prisma.workDiary.create({
        data: {
          projectId,
          weatherMorning: weatherMorning || 'Sol',
          weatherAfternoon: weatherAfternoon || 'Sol',
          workforceCount: Number(workforceCount || 0),
          activitiesExecuted,
          occurrences,
          photosUrls: Array.isArray(photosUrls) ? photosUrls : [],
          engineerName
        }
      });
      return res.status(201).json(diary);
    } catch (error) {
      return res.status(500).json({ error: 'Erro ao registrar Diário de Obra.' });
    }
  }

  // =========================================================================
  // 3. BIM, DESIGN DE FACHADA/INTERIORES & PERSONALIZAÇÃO DE UNIDADES (KIT OPÇÕES)
  // =========================================================================
  async addBimFile(req: Request, res: Response) {
    try {
      const projectId = String(req.params.projectId);
      const { discipline, fileName, fileFormat, fileUrl, version, clashStatus, clashDescription, responsibleDesigner } = req.body;

      const bim = await prisma.bimProjectFile.create({
        data: {
          projectId,
          discipline,
          fileName,
          fileFormat: fileFormat || 'IFC',
          fileUrl,
          version: version || 'R01',
          clashStatus: clashStatus || 'COMPATIBILIZADO',
          clashDescription,
          responsibleDesigner
        }
      });
      return res.status(201).json(bim);
    } catch (error) {
      return res.status(500).json({ error: 'Erro ao subir projeto BIM / Planta.' });
    }
  }

  async createCustomizationOption(req: Request, res: Response) {
    try {
      const projectId = String(req.params.projectId);
      const { category, title, specification, imageUrl, additionalPrice, maxStageAllowedPct } = req.body;

      const kit = await prisma.customizationKitOption.create({
        data: {
          projectId,
          category,
          title,
          specification,
          imageUrl,
          additionalPrice: Number(additionalPrice || 0),
          maxStageAllowedPct: Number(maxStageAllowedPct ?? 50)
        }
      });
      return res.status(201).json(kit);
    } catch (error) {
      return res.status(500).json({ error: 'Erro ao cadastrar Kit de Personalização.' });
    }
  }

  // Cria Pedido de Personalização -> Gera Aditivo no Contrato + Ordem de Serviço (OS) para o Canteiro
  async createUnitCustomizationOrder(req: Request, res: Response) {
    try {
      const projectId = String(req.params.projectId);
      const { unitNumber, buyerName, buyerDocument, contractId, selectedOptionIds, approveAndGenerateAddendum } = req.body;

      const options = await prisma.customizationKitOption.findMany({
        where: { id: { in: Array.isArray(selectedOptionIds) ? selectedOptionIds : [] } }
      });

      const totalAdditionalAmount = options.reduce((acc: number, opt: any) => acc + Number(opt.additionalPrice || 0), 0);
      const osCode = `OS-PERS-${Math.floor(10000 + Math.random() * 90000)}`;
      const instructions = options.map((o: any) => `• [${o.category}] ${o.title}: ${o.specification}`).join('\n');

      const order = await prisma.unitCustomizationOrder.create({
        data: {
          projectId,
          unitNumber,
          buyerName,
          buyerDocument,
          contractId: contractId || null,
          selectedItemsJson: options,
          totalAdditionalAmount,
          addendumStatus: approveAndGenerateAddendum ? 'ADITIVO_ASSINADO' : 'AGUARDANDO_ASSINATURA',
          engineeringOsCode: osCode,
          engineeringOsStatus: approveAndGenerateAddendum ? 'OS_EMITIDA_CANTEIRO' : 'AGUARDANDO_ADITIVO',
          engineeringInstructions: `UNIDADE ${unitNumber} (${buyerName}):\n${instructions}`
        }
      });

      // Se o aditivo foi assinado e há um Contrato vinculado, gera automaticamente a fatura do Aditivo no Financeiro!
      if (approveAndGenerateAddendum && contractId && totalAdditionalAmount > 0) {
        const dueDate = new Date();
        dueDate.setDate(dueDate.getDate() + 15);

        await prisma.invoice.create({
          data: {
            contractId,
            description: `Aditivo Contratual de Personalização (${osCode} - ${unitNumber})`,
            dueDate,
            status: 'Pendente',
            totalAmount: totalAdditionalAmount,
            realEstateFee: totalAdditionalAmount,
            ownerAmount: 0
          }
        });
      }

      return res.status(201).json(order);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao processar personalização da unidade e aditivo.' });
    }
  }

  // =========================================================================
  // 4. REAJUSTE DE CARTEIRA DE RECEBÍVEIS PELO INCC
  // =========================================================================
  async applyInccReadjustment(req: Request, res: Response) {
    try {
      const projectId = String(req.params.projectId);
      const { inccPercent } = req.body;
      const pct = Number(inccPercent || 0);

      if (pct <= 0) {
        return res.status(400).json({ error: 'Informe um percentual de INCC válido maior que zero.' });
      }

      const project = await prisma.developmentProject.findUnique({ where: { id: projectId } });
      if (!project) return res.status(404).json({ error: 'Empreendimento não encontrado.' });

      // Atualiza faturas pendentes de contratos marcados com índice INCC da imobiliária
      const pendingInvoices = await prisma.invoice.findMany({
        where: {
          status: 'Pendente',
          contract: {
            realEstateId: project.realEstateId,
            readjustmentIndex: 'INCC'
          }
        }
      }).catch(() => []);

      for (const inv of pendingInvoices) {
        const factor = 1 + pct / 100;
        await prisma.invoice.update({
          where: { id: inv.id },
          data: {
            totalAmount: Number((inv.totalAmount * factor).toFixed(2)),
            realEstateFee: Number((inv.realEstateFee * factor).toFixed(2)),
            ownerAmount: Number((inv.ownerAmount * factor).toFixed(2)),
            description: `${inv.description || 'Parcela'} (Reajustado INCC +${pct}%)`
          }
        });
      }

      await prisma.developmentProject.update({
        where: { id: projectId },
        data: { accumulatedInccPercent: Number((project.accumulatedInccPercent + pct).toFixed(2)) }
      });

      return res.json({
        message: `Reajuste de INCC (+${pct}%) aplicado com sucesso em ${pendingInvoices.length} parcelas pendentes!`
      });
    } catch (error) {
      return res.status(500).json({ error: 'Erro ao aplicar reajuste de INCC.' });
    }
  }

  // =========================================================================
  // 5. ROTA PÚBLICA: PÁGINA PERSONALIZADA DA INCORPORADORA NO SITE DA LOJA
  // =========================================================================
  async getPublicDeveloperShowcase(req: Request, res: Response) {
    try {
      const slug = String(req.params.slug);
      const store = await prisma.realEstate.findUnique({
        where: { slug },
        select: {
          id: true,
          tradeName: true,
          logoUrl: true,
          phone: true,
          whatsappDisplay: true,
          email: true,
          address: true
        }
      });

      if (!store) return res.status(404).json({ error: 'Imobiliária/Incorporadora não encontrada.' });

      const projects = await prisma.developmentProject.findMany({
        where: {
          realEstateId: store.id,
          showOnPublicSite: true
        },
        include: {
          customizationOptions: { where: { isActive: true } },
          bimFiles: { where: { isLatestRevision: true } }
        },
        orderBy: { createdAt: 'desc' }
      });

      return res.json({ store, projects });
    } catch (error) {
      return res.status(500).json({ error: 'Erro ao carregar vitrine pública da incorporadora.' });
    }
  }

// =========================================================================
  // 6. PORTAL DO CLIENTE: ACOMPANHAMENTO DE OBRA & AUTO-PERSONALIZAÇÃO
  // =========================================================================
  async getPortalDeveloperData(req: Request, res: Response) {
    try {
      const user = (req as any).user;
      const realEstateId = user.realEstateId;

      const projects = await prisma.developmentProject.findMany({
        where: { realEstateId },
        include: {
          workDiaries: { orderBy: { date: 'desc' }, take: 10 },
          customizationOptions: { where: { isActive: true } },
          customizationOrders: {
            orderBy: { createdAt: 'desc' }
          }
        },
        orderBy: { createdAt: 'desc' }
      });

      return res.json({ projects });
    } catch (error) {
      return res.status(500).json({ error: 'Erro ao carregar dados da obra no Portal do Cliente.' });
    }
  }

  async createPortalCustomizationOrder(req: Request, res: Response) {
    try {
      const user = (req as any).user;
      const projectId = String(req.params.projectId);
      const { unitNumber, contractId, selectedOptionIds } = req.body;

      const project = await prisma.developmentProject.findUnique({
        where: { id: projectId }
      });

      if (!project) {
        return res.status(404).json({ error: 'Empreendimento não encontrado.' });
      }

      const options = await prisma.customizationKitOption.findMany({
        where: {
          id: { in: Array.isArray(selectedOptionIds) ? selectedOptionIds : [] },
          projectId
        }
      });

      if (options.length === 0) {
        return res.status(400).json({ error: 'Selecione ao menos um kit de acabamento.' });
      }

      // Valida se o avanço físico da obra ainda permite personalização para os itens escolhidos
      const blockedOption = options.find((opt: any) => project.overallProgressPct > opt.maxStageAllowedPct);
      if (blockedOption) {
        return res.status(400).json({
          error: `O item "${blockedOption.title}" só pode ser solicitado até ${blockedOption.maxStageAllowedPct}% de avanço da obra (atual: ${project.overallProgressPct}%).`
        });
      }

      const totalAdditionalAmount = options.reduce((acc: number, opt: any) => acc + Number(opt.additionalPrice || 0), 0);
      const osCode = `OS-APP-${Math.floor(10000 + Math.random() * 90000)}`;
      const buyerName = user.name || 'Comprador Portal';
      const instructions = options.map((o: any) => `• [${o.category}] ${o.title}: ${o.specification}`).join('\n');

      const order = await prisma.unitCustomizationOrder.create({
        data: {
          projectId,
          unitNumber: unitNumber || 'Unidade do Contrato',
          buyerName,
          buyerDocument: user.document || null,
          contractId: contractId || null,
          selectedItemsJson: options,
          totalAdditionalAmount,
          addendumStatus: 'ADITIVO_ASSINADO',
          engineeringOsCode: osCode,
          engineeringOsStatus: 'OS_EMITIDA_CANTEIRO',
          engineeringInstructions: `SOLICITADO PELO COMPRADOR NO PORTAL — UNIDADE ${unitNumber}:\n${instructions}`
        }
      });

      // Se houver contrato vinculado, gera automaticamente a fatura do Aditivo no Financeiro do cliente
      if (contractId && totalAdditionalAmount > 0) {
        const dueDate = new Date();
        dueDate.setDate(dueDate.getDate() + 10);

        await prisma.invoice.create({
          data: {
            contractId,
            description: `Aditivo de Personalização de Planta/Acabamento (${osCode} - ${unitNumber})`,
            dueDate,
            status: 'Pendente',
            totalAmount: totalAdditionalAmount,
            realEstateFee: totalAdditionalAmount,
            ownerAmount: 0
          }
        });
      }

      return res.status(201).json({
        message: 'Personalização confirmada! Aditivo gerado no seu financeiro e Ordem de Serviço enviada para a engenharia.',
        order
      });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao registrar personalização pelo Portal.' });
    }
  }

}