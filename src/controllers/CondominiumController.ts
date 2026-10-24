import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient() as any;

// Helper para encontrar a imobiliária correta (Corretor ou Admin)
async function getRealEstateId(req: Request): Promise<string | null> {
  const reqAny = req as any;
  if (reqAny.realEstateId) return reqAny.realEstateId;
  if (reqAny.user?.realEstateId) return reqAny.user.realEstateId;
  const userId = reqAny.userId || reqAny.user?.id;
  if (!userId) return null;
  const store = await prisma.realEstate.findUnique({ where: { id: userId } });
  if (store) return store.id;
  const broker = await prisma.broker.findUnique({ where: { id: userId } });
  if (broker) return broker.realEstateId;
  return null;
}

export class CondominiumController {
  
  //=========================================
  // CADASTRAR CONDOMÍNIO
  //=========================================
  async create(req: Request, res: Response) {
    try {
      const realEstateId = await getRealEstateId(req);
      if (!realEstateId) return res.status(403).json({ error: 'Acesso negado.' });

      const {
        cnpj, name, cep, address, neighborhood, city, state, type,
        adminName, managerName, email, phone, towerOrBlock,
        privateArea, hasGarage, hasCoveredGarage
      } = req.body;

      const condominium = await prisma.condominium.create({
        data: {
          name, cnpj, cep, address, neighborhood, city, state, type,
          adminName, managerName, email, phone, towerOrBlock,
          privateArea: privateArea ? Number(privateArea) : null,
          hasGarage: Boolean(hasGarage),
          hasCoveredGarage: Boolean(hasCoveredGarage),
          realEstateId
        }
      });

      return res.status(201).json(condominium);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao cadastrar condomínio.' });
    }
  }

  //=========================================
  // LISTAR CONDOMÍNIOS
  //=========================================
  async list(req: Request, res: Response) {
    try {
      const realEstateId = await getRealEstateId(req);
      if (!realEstateId) return res.status(403).json({ error: 'Acesso negado.' });

      const condominiums = await prisma.condominium.findMany({
        where: { realEstateId },
        include: {
          properties: true,
          units: {
            include: {
              owner: { select: { id: true, name: true } },
              client: { select: { id: true, name: true } }
            },
            orderBy: { unitNumber: 'asc' }
          },
          expenses: { orderBy: { dueDate: 'desc' } },
          reservations: { orderBy: { reservationDate: 'asc' } },
          occurrences: { orderBy: { createdAt: 'desc' } },
          bills: { include: { unit: true }, orderBy: { dueDate: 'desc' } },
          readings: { include: { unit: true }, orderBy: { createdAt: 'desc' } }, 
          agreements: { include: { unit: true }, orderBy: { createdAt: 'desc' } },
          assemblies: { orderBy: { assemblyDate: 'desc' } },
          settings: true,
          _count: { select: { properties: true, units: true, bills: true } }
        },
        orderBy: { name: 'asc' }
      });

      return res.json(condominiums);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao listar condomínios.' });
    }
  }

  // ==========================================
  // ATUALIZAR CONDOMÍNIO
  // ==========================================
  async update(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const realEstateId = await getRealEstateId(req);
      if (!realEstateId) return res.status(403).json({ error: 'Acesso negado.' });

      const {
        cnpj, name, cep, address, neighborhood, city, state, type,
        adminName, managerName, email, phone, towerOrBlock,
        privateArea, hasGarage, hasCoveredGarage
      } = req.body;

      const condominium = await prisma.condominium.update({
        where: { id, realEstateId },
        data: {
          name, cnpj, cep, address, neighborhood, city, state, type,
          adminName, managerName, email, phone, towerOrBlock,
          privateArea: privateArea ? Number(privateArea) : null,
          hasGarage: Boolean(hasGarage),
          hasCoveredGarage: Boolean(hasCoveredGarage)
        }
      });

      return res.json(condominium);
    } catch (error) {
      return res.status(500).json({ error: 'Erro ao atualizar condomínio.' });
    }
  }

  // ==========================================
  // ATIVAR / DESATIVAR CONDOMÍNIO
  // ==========================================
  async toggleStatus(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const realEstateId = await getRealEstateId(req);
      if (!realEstateId) return res.status(403).json({ error: 'Acesso negado.' });

      const condominium = await prisma.condominium.findUnique({
        where: { id, realEstateId }
      });

      if (!condominium) return res.status(404).json({ error: 'Condomínio não encontrado.' });

      const updated = await prisma.condominium.update({
        where: { id },
        data: { isActive: !condominium.isActive }
      });

      return res.json(updated);
    } catch (error) {
      return res.status(500).json({ error: 'Erro ao alterar status do condomínio.' });
    }
  }

  // ==========================================
  // GESTÃO DE UNIDADES (APARTAMENTOS / CASAS)
  // ==========================================
  async createUnit(req: Request, res: Response) {
    try {
      const { condominiumId } = req.params;
      let { unitNumber, block, floor, fractionIdeal, ownerName, tenantName, ownerId, clientId } = req.body;

      if (ownerId && !ownerName) {
        const ownerObj = await prisma.owner.findUnique({ where: { id: ownerId } }).catch(() => null);
        if (ownerObj) ownerName = ownerObj.name || ownerObj.corporateName;
      }

      if (clientId && !tenantName) {
        const clientObj = await prisma.client.findUnique({ where: { id: clientId } }).catch(() => null);
        if (clientObj) tenantName = clientObj.name;
      }

      const unit = await prisma.condoUnit.create({
        data: {
          condominiumId,
          unitNumber,
          block,
          floor: floor ? Number(floor) : null,
          fractionIdeal: fractionIdeal ? Number(fractionIdeal) : 1.0,
          ownerName: ownerName || null,
          tenantName: tenantName || null,
          ownerId: ownerId || null,
          clientId: clientId || null
        },
        include: {
          owner: { select: { id: true, name: true } },
          client: { select: { id: true, name: true } }
        }
      });

      return res.status(201).json(unit);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao cadastrar unidade do condomínio.' });
    }
  }

  //===========================================
  // LISTAR UNIDADES DO CONDOMÍNIO
  //===========================================
  async listUnits(req: Request, res: Response) {
    try {
      const { condominiumId } = req.params;
      const units = await prisma.condoUnit.findMany({
        where: { condominiumId },
        include: {
          owner: { select: { id: true, name: true } },
          client: { select: { id: true, name: true } }
        },
        orderBy: { unitNumber: 'asc' }
      });
      return res.json(units);
    } catch (error) {
      return res.status(500).json({ error: 'Erro ao listar unidades.' });
    }
  }
  
  // ==========================================
  // ATUALIZAR UNIDADE DO CONDOMÍNIO
  // ==========================================
  async updateUnit(req: Request, res: Response) {
    try {
      const { unitId } = req.params;
      const { unitNumber, block, floor, fractionIdeal, ownerId, clientId } = req.body;

      let ownerName = null;
      let tenantName = null;

      if (ownerId) {
        const ownerObj = await prisma.owner.findUnique({ where: { id: ownerId } }).catch(() => null);
        if (ownerObj) ownerName = ownerObj.name || ownerObj.corporateName;
      }

      if (clientId) {
        const clientObj = await prisma.client.findUnique({ where: { id: clientId } }).catch(() => null);
        if (clientObj) tenantName = clientObj.name;
      }

      const unit = await prisma.condoUnit.update({
        where: { id: unitId },
        data: {
          unitNumber,
          block,
          floor: floor ? Number(floor) : null,
          fractionIdeal: fractionIdeal ? Number(fractionIdeal) : 1.0,
          ownerId: ownerId || null,
          clientId: clientId || null,
          ownerName,
          tenantName
        },
        include: {
          owner: { select: { id: true, name: true } },
          client: { select: { id: true, name: true } }
        }
      });

      return res.json({ message: 'Unidade atualizada com sucesso!', unit });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao atualizar unidade.' });
    }
  }

  // ==========================================
  // RATEIO DE DESPESAS DO CONDOMÍNIO
  // ==========================================
  async createExpense(req: Request, res: Response) {
    try {
      const { condominiumId } = req.params;
      const { description, amount, dueDate, category } = req.body;

      const expense = await prisma.condoExpense.create({
        data: {
          condominiumId,
          description,
          amount: Number(amount),
          dueDate: new Date(dueDate),
          category: category || 'Manutenção'
        }
      });

      return res.status(201).json(expense);
    } catch (error) {
      return res.status(500).json({ error: 'Erro ao lançar despesa condominial.' });
    }
  }

  // ==========================================
  // ATUALIZAR DESPESA DO CONDOMÍNIO
  // ==========================================
  async updateExpense(req: Request, res: Response) {
    try {
      const { expenseId } = req.params;
      const { description, amount, dueDate, category } = req.body;

      const updated = await prisma.condoExpense.update({
        where: { id: expenseId },
        data: {
          description,
          amount: amount !== undefined ? Number(amount) : undefined,
          dueDate: dueDate ? new Date(dueDate) : undefined,
          category
        }
      });

      return res.json({ message: 'Despesa atualizada com sucesso!', expense: updated });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao atualizar despesa.' });
    }
  }

  // ==========================================
  // LISTAR DESPESAS DO CONDOMÍNIO
  // ==========================================
  async listExpenses(req: Request, res: Response) {
    try {
      const { condominiumId } = req.params;
      const expenses = await prisma.condoExpense.findMany({
        where: { condominiumId },
        orderBy: { dueDate: 'desc' }
      });
      return res.json(expenses);
    } catch (error) {
      return res.status(500).json({ error: 'Erro ao listar despesas.' });
    }
  }

  // ==========================================
  // RESERVAS DE ÁREAS COMUNS
  // ==========================================
  async createReservation(req: Request, res: Response) {
    try {
      const { condominiumId } = req.params;
      const { areaName, reservedBy, reservationDate, notes } = req.body;

      const reservation = await prisma.condoReservation.create({
        data: {
          condominiumId,
          areaName,
          reservedBy,
          reservationDate: new Date(reservationDate),
          notes
        }
      });

      return res.status(201).json(reservation);
    } catch (error) {
      return res.status(500).json({ error: 'Erro ao registrar reserva de área comum.' });
    }
  }

  // ==========================================
  // LISTAR RESERVAS DE ÁREAS COMUNS
  // ========================================== 
  async listReservations(req: Request, res: Response) {
    try {
      const { condominiumId } = req.params;
      const reservations = await prisma.condoReservation.findMany({
        where: { condominiumId },
        orderBy: { reservationDate: 'asc' }
      });
      return res.json(reservations);
    } catch (error) {
      return res.status(500).json({ error: 'Erro ao listar reservas.' });
    }
  }

  // ==========================================
  // ATUALIZAR RESERVA DE ÁREA COMUM
  // ==========================================
  async updateReservation(req: Request, res: Response) {
    try {
      const { reservationId } = req.params;
      const { areaName, reservedBy, reservationDate, notes } = req.body;

      const updated = await prisma.condoReservation.update({
        where: { id: reservationId },
        data: {
          areaName,
          reservedBy,
          reservationDate: reservationDate ? new Date(reservationDate) : undefined,
          notes
        }
      });

      return res.json({ message: 'Reserva atualizada com sucesso!', reservation: updated });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao atualizar reserva.' });
    }
  }

  // ==========================================
  // LIVRO DE OCORRÊNCIAS
  // ==========================================
  async createOccurrence(req: Request, res: Response) {
    try {
      const { condominiumId } = req.params;
      const { title, description, reportedBy, priority } = req.body;

      const occurrence = await prisma.condoOccurrence.create({
        data: {
          condominiumId,
          title,
          description,
          reportedBy,
          priority: priority || 'Normal'
        }
      });

      return res.status(201).json(occurrence);
    } catch (error) {
      return res.status(500).json({ error: 'Erro ao registrar ocorrência.' });
    }
  }

  //==========================================
  // LISTAR OCORRÊNCIAS DO LIVRO DE OCORRÊNCIAS
  //==========================================
  async listOccurrences(req: Request, res: Response) {
    try {
      const { condominiumId } = req.params;
      const occurrences = await prisma.condoOccurrence.findMany({
        where: { condominiumId },
        orderBy: { createdAt: 'desc' }
      });
      return res.json(occurrences);
    } catch (error) {
      return res.status(500).json({ error: 'Erro ao listar ocorrências.' });
    }
  }

  // ==========================================
  // ATUALIZAR OCORRÊNCIA
  // ==========================================
  async updateOccurrence(req: Request, res: Response) {
    try {
      const { occurrenceId } = req.params;
      const { title, description, reportedBy, priority, status } = req.body;

      const updated = await prisma.condoOccurrence.update({
        where: { id: occurrenceId },
        data: {
          title,
          description,
          reportedBy,
          priority,
          status
        }
      });

      return res.json({ message: 'Ocorrência atualizada com sucesso!', occurrence: updated });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao atualizar ocorrência.' });
    }
  }

  // ==========================================
  // CONFIGURAÇÕES DE JUROS E MULTA DO CONDOMÍNIO
  // ==========================================
  async updateSettings(req: Request, res: Response) {
    try {
      const { condominiumId } = req.params;
      const { finePercent, interestPercent, calcType, bankIntegration } = req.body;

      const settings = await prisma.condoSetting.upsert({
        where: { condominiumId },
        update: {
          finePercent: finePercent !== undefined ? Number(finePercent) : undefined,
          interestPercent: interestPercent !== undefined ? Number(interestPercent) : undefined,
          calcType: calcType || undefined,
          bankIntegration: bankIntegration || undefined
        },
        create: {
          condominiumId,
          finePercent: finePercent ? Number(finePercent) : 2.0,
          interestPercent: interestPercent ? Number(interestPercent) : 1.0,
          calcType: calcType || 'PRO_RATA',
          bankIntegration: bankIntegration || 'API'
        }
      });

      return res.json({ message: 'Configurações de juros e multas atualizadas com sucesso!', settings });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao atualizar configurações.' });
    }
  }

  //==========================================
  // OBTER CONFIGURAÇÕES DE JUROS E MULTA DO CONDOMÍNIO
  //==========================================  
  async getSettings(req: Request, res: Response) {
    try {
      const { condominiumId } = req.params;
      let settings = await prisma.condoSetting.findUnique({ where: { condominiumId } });
      
      if (!settings) {
        settings = await prisma.condoSetting.create({
          data: { condominiumId, finePercent: 2.0, interestPercent: 1.0, calcType: 'PRO_RATA', bankIntegration: 'API' }
        });
      }

      return res.json(settings);
    } catch (error) {
      return res.status(500).json({ error: 'Erro ao buscar configurações.' });
    }
  }

  // ==========================================
  // GERAR COBRANÇAS / RATEIO AUTOMÁTICO CONSOLIDADO (TAXA + CONSUMO)
  // ==========================================
  async generateMonthlyBills(req: Request, res: Response) {
    try {
      const { condominiumId } = req.params;
      const { referenceMonth, dueDate, baseAmount } = req.body;

      let settings = await prisma.condoSetting.findUnique({ where: { condominiumId } });
      const fineRate = settings ? settings.finePercent : 2.0;
      const interestRate = settings ? settings.interestPercent : 1.0;

      const units = await prisma.condoUnit.findMany({ where: { condominiumId } });
      if (!units.length) return res.status(400).json({ error: 'Nenhuma unidade cadastrada neste condomínio.' });

      const totalFraction = units.reduce((acc: number, u: any) => acc + (u.fractionIdeal || 1.0), 0);
      const generatedBills = [];
      const refMonth = referenceMonth || 'Atual';

      for (const unit of units) {
        const proportion = (unit.fractionIdeal || 1.0) / totalFraction;
        const condoFeePortion = Number(baseAmount || 0) * proportion;

        // Soma leituras de consumo (Água, Gás, Energia) da unidade no mesmo mês de referência
        const readings = await prisma.condoConsumptionReading.findMany({
          where: { unitId: unit.id, referenceMonth: refMonth }
        }).catch(() => []);

        const totalConsumptionAmount = readings.reduce((sum: number, r: any) => sum + Number(r.totalAmount || 0), 0);
        const unitTotalAmount = condoFeePortion + totalConsumptionAmount;

        const bill = await prisma.condoBill.create({
          data: {
            condominiumId,
            unitId: unit.id,
            referenceMonth: refMonth,
            dueDate: new Date(dueDate || Date.now()),
            amount: Number(unitTotalAmount.toFixed(2)),
            status: 'Pendente',
            destinationsJson: {
              taxaCondominio: Number(condoFeePortion.toFixed(2)),
              consumoIndividual: Number(totalConsumptionAmount.toFixed(2)),
              fineAppliedPercent: fineRate,
              interestAppliedPercent: interestRate
            }
          },
          include: { unit: true }
        });
        generatedBills.push(bill);
      }

      return res.status(201).json({ message: 'Cobranças mensais geradas com sucesso!', count: generatedBills.length, bills: generatedBills });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao gerar cobranças mensais.' });
    }
  }

  // ==========================================
  // LISTAR BOLETOS / FATURAS GERADAS
  // ==========================================
  async listBills(req: Request, res: Response) {
    try {
      const { condominiumId } = req.params;
      const bills = await prisma.condoBill.findMany({
        where: { condominiumId },
        include: { unit: true },
        orderBy: { dueDate: 'desc' }
      });
      return res.json(bills);
    } catch (error) {
      return res.status(500).json({ error: 'Erro ao listar faturas/boletos.' });
    }
  }

  // ==========================================
  // ATUALIZAR BOLETO / FATURA GERADA
  // ==========================================
  async updateBill(req: Request, res: Response) {
    try {
      const { billId } = req.params;
      const { dueDate, amount, referenceMonth, status } = req.body;

      const updated = await prisma.condoBill.update({
        where: { id: billId },
        data: {
          dueDate: dueDate ? new Date(dueDate) : undefined,
          amount: amount !== undefined ? Number(amount) : undefined,
          referenceMonth,
          status
        }
      });

      return res.json({ message: 'Boleto atualizado com sucesso!', bill: updated });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao atualizar boleto.' });
    }
  }

  // ==========================================
  // BAIXA DE BOLETOS / MARCAR COMO PAGO
  // ==========================================
  async markBillAsPaid(req: Request, res: Response) {
    try {
      const { billId } = req.params;
      const { paymentMethod } = req.body;

      const updated = await prisma.condoBill.update({
        where: { id: billId },
        data: {
          status: 'Pago',
          paidDate: new Date(),
          paymentMethod: paymentMethod || 'Baixa Manual'
        }
      });

      return res.json({ message: 'Baixa realizada com sucesso!', bill: updated });
    } catch (error) {
      return res.status(500).json({ error: 'Erro ao dar baixa no boleto.' });
    }
  }

  // ==========================================
  // LEITURA DE CONSUMO (ÁGUA, GÁS, ENERGIA) COM FOTO/IA
  // ==========================================
  async createConsumptionReading(req: Request, res: Response) {
    try {
      const { condominiumId } = req.params;
      const { unitId, utilityType, previousValue, currentValue, unitPrice, referenceMonth, photoUrl } = req.body;

      const prev = Number(previousValue || 0);
      const curr = Number(currentValue || 0);
      const consumption = Math.max(0, curr - prev);
      const price = Number(unitPrice || 0);
      const totalAmount = consumption * price;

      const reading = await prisma.condoConsumptionReading.create({
        data: {
          condominiumId,
          unitId,
          utilityType: utilityType || 'Água',
          previousValue: prev,
          currentValue: curr,
          consumption,
          unitPrice: price,
          totalAmount: Number(totalAmount.toFixed(2)),
          referenceMonth: referenceMonth || 'Atual',
          photoUrl: photoUrl || null
        },
        include: { unit: true }
      });

      return res.status(201).json({ message: 'Leitura registrada com sucesso!', reading });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao registrar leitura de consumo.' });
    }
  }

  // ==========================================
  // LISTAR LEITURAS DE CONSUMO
  // ==========================================
  async listConsumptionReadings(req: Request, res: Response) {
    try {
      const { condominiumId } = req.params;
      const readings = await prisma.condoConsumptionReading.findMany({
        where: { condominiumId },
        include: { unit: true },
        orderBy: { createdAt: 'desc' }
      });
      return res.json(readings);
    } catch (error) {
      return res.status(500).json({ error: 'Erro ao listar leituras.' });
    }
  }

  // ==========================================
  // ATUALIZAR LEITURA DE CONSUMO (ÁGUA, GÁS, ENERGIA)
  // ==========================================
  async updateConsumptionReading(req: Request, res: Response) {
    try {
      const { readingId } = req.params;
      const { previousValue, currentValue, unitPrice, referenceMonth, utilityType } = req.body;

      const prev = Number(previousValue || 0);
      const curr = Number(currentValue || 0);
      const consumption = Math.max(0, curr - prev);
      const price = Number(unitPrice || 0);
      const totalAmount = consumption * price;

      const updated = await prisma.condoConsumptionReading.update({
        where: { id: readingId },
        data: {
          utilityType,
          previousValue: prev,
          currentValue: curr,
          consumption,
          unitPrice: price,
          totalAmount: Number(totalAmount.toFixed(2)),
          referenceMonth
        }
      });

      return res.json({ message: 'Leitura atualizada com sucesso!', reading: updated });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao atualizar leitura de consumo.' });
    }
  }

  // ==========================================
  // ACORDOS E PARCELAMENTO DE DÉBITOS
  // ==========================================
  async createAgreement(req: Request, res: Response) {
    try {
      const { condominiumId } = req.params;
      const { unitId, totalDebt, installments } = req.body;

      const debt = Number(totalDebt);
      const instCount = Number(installments);
      const installmentValue = Number((debt / instCount).toFixed(2));

      const agreement = await prisma.condoAgreement.create({
        data: {
          condominiumId,
          unitId,
          totalDebt: debt,
          installments: instCount,
          installmentValue,
          status: 'Ativo'
        },
        include: { unit: true }
      });

      for (let i = 1; i <= instCount; i++) {
        const dueDate = new Date();
        dueDate.setMonth(dueDate.getMonth() + i);

        await prisma.condoBill.create({
          data: {
            condominiumId,
            unitId,
            referenceMonth: `Acordo ${i}/${instCount}`,
            dueDate,
            amount: installmentValue,
            status: 'Pendente',
            destinationsJson: { tipo: 'Parcela de Acordo', parcela: `${i}/${instCount}` }
          }
        });
      }

      return res.status(201).json({ message: 'Acordo formalizado e boletos gerados!', agreement });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao registrar acordo de débitos.' });
    }
  }

  async listAgreements(req: Request, res: Response) {
    try {
      const { condominiumId } = req.params;
      const agreements = await prisma.condoAgreement.findMany({
        where: { condominiumId },
        include: { unit: true },
        orderBy: { createdAt: 'desc' }
      });
      return res.json(agreements);
    } catch (error) {
      return res.status(500).json({ error: 'Erro ao listar acordos.' });
    }
  }

  async updateAgreement(req: Request, res: Response) {
    try {
      const { agreementId } = req.params;
      const { totalDebt, installments, status } = req.body;

      const dataToUpdate: any = { status };
      if (totalDebt !== undefined) dataToUpdate.totalDebt = Number(totalDebt);
      if (installments !== undefined) dataToUpdate.installments = Number(installments);
      if (totalDebt !== undefined && installments !== undefined && Number(installments) > 0) {
        dataToUpdate.installmentValue = Number((Number(totalDebt) / Number(installments)).toFixed(2));
      }

      const updated = await prisma.condoAgreement.update({
        where: { id: agreementId },
        data: dataToUpdate
      });

      return res.json({ message: 'Acordo atualizado com sucesso!', agreement: updated });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao atualizar acordo.' });
    }
  }

  // ==========================================
  // ASSEMBLEIAS, REUNIÕES E ATAS
  // ==========================================
  async createAssembly(req: Request, res: Response) {
    try {
      const { condominiumId } = req.params;
      const { title, assemblyDate, description, status, minutesUrl } = req.body;

      const assembly = await prisma.condoAssembly.create({
        data: {
          condominiumId,
          title,
          assemblyDate: new Date(assemblyDate),
          description,
          status: status || 'Agendada',
          minutesUrl: minutesUrl || null
        }
      });

      return res.status(201).json({ message: 'Assembleia cadastrada com sucesso!', assembly });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao cadastrar assembleia.' });
    }
  }

  async listAssemblies(req: Request, res: Response) {
    try {
      const { condominiumId } = req.params;
      const assemblies = await prisma.condoAssembly.findMany({
        where: { condominiumId },
        orderBy: { assemblyDate: 'desc' }
      });
      return res.json(assemblies);
    } catch (error) {
      return res.status(500).json({ error: 'Erro ao listar assembleias.' });
    }
  }

  async updateAssembly(req: Request, res: Response) {
    try {
      const { assemblyId } = req.params;
      const { title, assemblyDate, description, status, minutesUrl } = req.body;

      const updated = await prisma.condoAssembly.update({
        where: { id: assemblyId },
        data: {
          title,
          assemblyDate: assemblyDate ? new Date(assemblyDate) : undefined,
          description,
          status,
          minutesUrl: minutesUrl || null
        }
      });

      return res.json({ message: 'Assembleia atualizada com sucesso!', assembly: updated });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao atualizar assembleia.' });
    }
  }
}