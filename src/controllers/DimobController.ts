import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient() as any;

export class DimobController {
  
  // 1. Endpoint para gerar o Resumo (Dashboard da DIMOB no Frontend)
  async getSummary(req: Request, res: Response) {
    try {
      const year = Number(req.query.year) || new Date().getFullYear() - 1;
      const user = req.user as any;
      const realEstateId = user?.realEstateId || user?.id;

      const startDate = new Date(`${year}-01-01T00:00:00.000Z`);
      const endDate = new Date(`${year}-12-31T23:59:59.999Z`);

      // Buscar faturas de locação pagas neste ano
      const invoices = await prisma.invoice.findMany({
        where: {
          status: 'Pago',
          paidDate: { gte: startDate, lte: endDate },
          contract: { property: { realEstateId } }
        },
        include: {
          contract: { include: { tenant: true, property: { include: { owner: true } } } }
        }
      });

      let totalRent = 0;
      let totalCommission = 0;
      const uniqueContracts = new Set();
      const uniqueOwners = new Set();

      invoices.forEach((inv: any) => {
        totalRent += inv.totalAmount;
        totalCommission += inv.realEstateFee;
        uniqueContracts.add(inv.contractId);
        if (inv.contract.property.ownerId) uniqueOwners.add(inv.contract.property.ownerId);
      });

      return res.json({
        year,
        totalInvoices: invoices.length,
        totalRent,
        totalCommission,
        activeContracts: uniqueContracts.size,
        involvedOwners: uniqueOwners.size
      });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao gerar resumo da DIMOB.' });
    }
  }

  // 2. Endpoint para Gerar e Baixar o Ficheiro TXT Oficial
  async exportTxt(req: Request, res: Response) {
    try {
      const year = Number(req.query.year) || new Date().getFullYear() - 1;
      const user = req.user as any;
      const realEstateId = user?.realEstateId || user?.id;

      // Buscar dados da imobiliária para o Header
      const store = await prisma.realEstate.findUnique({ where: { id: realEstateId } });
      if (!store || !store.cnpj) return res.status(400).json({ error: 'CNPJ da imobiliária não configurado.' });

      const startDate = new Date(`${year}-01-01T00:00:00.000Z`);
      const endDate = new Date(`${year}-12-31T23:59:59.999Z`);

      const invoices = await prisma.invoice.findMany({
        where: {
          status: 'Pago',
          paidDate: { gte: startDate, lte: endDate },
          contract: { property: { realEstateId } }
        },
        include: {
          contract: { include: { tenant: true, property: { include: { owner: true } } } }
        }
      });

      // ==========================================
      // LÓGICA DE GERAÇÃO DO LAYOUT DIMOB
      // ==========================================
      const cleanDoc = (doc: string) => (doc ? doc.replace(/\D/g, '') : '');
      const padRight = (str: string, length: number) => String(str).substring(0, length).padEnd(length, ' ');
      const padZero = (num: number, length: number) => Math.round(num * 100).toString().padStart(length, '0');

      let txtContent = '';

      // T01 - REGISTRO HEADER (Declarador)
      const cnpjDeclarador = cleanDoc(store.cnpj).padStart(14, '0');
      txtContent += `DIMOB${year}${cnpjDeclarador}${padRight(store.corporateName || store.tradeName, 60)}\n`;

      // Agrupar faturas por Contrato para a Ficha de Locação (T02)
      const locacoesAgrupadas: Record<string, any> = {};

      invoices.forEach((inv: any) => {
        const contractId = inv.contractId;
        const paidMonth = new Date(inv.paidDate).getMonth() + 1; // 1 a 12

        if (!locacoesAgrupadas[contractId]) {
          const prop = inv.contract.property;
          const tenant = inv.contract.tenant;
          const owner = prop.owner;

          locacoesAgrupadas[contractId] = {
            cpfCnpjLocador: cleanDoc(owner?.cpfOrCnpj),
            nomeLocador: owner?.name || 'NAO INFORMADO',
            cpfCnpjLocatario: cleanDoc(tenant?.document),
            nomeLocatario: tenant?.name || 'NAO INFORMADO',
            numeroContrato: contractId.substring(0, 10), // Limitado no layout
            meses: Array(13).fill({ bruto: 0, comissao: 0, imposto: 0 }) // Índice 1 a 12
          };
        }

        // Soma os valores do mês correspondente
        const currentMonthData = locacoesAgrupadas[contractId].meses[paidMonth];
        locacoesAgrupadas[contractId].meses[paidMonth] = {
          bruto: currentMonthData.bruto + (inv.totalAmount || 0),
          comissao: currentMonthData.comissao + (inv.realEstateFee || 0),
          imposto: currentMonthData.imposto + 0 // Adicionar lógica de IRRF se houver
        };
      });

      // T02 - REGISTROS DE LOCAÇÃO
      let sequencial = 1;
      for (const key in locacoesAgrupadas) {
        const loc = locacoesAgrupadas[key];
        
        // Pula se não tiver os documentos essenciais (Evita erros na Receita)
        if (!loc.cpfCnpjLocador || !loc.cpfCnpjLocatario) continue;

        let linhaT02 = `T02`;
        linhaT02 += cleanDoc(loc.cpfCnpjLocador).padStart(14, '0');
        linhaT02 += padRight(loc.nomeLocador, 60);
        linhaT02 += cleanDoc(loc.cpfCnpjLocatario).padStart(14, '0');
        linhaT02 += padRight(loc.nomeLocatario, 60);
        linhaT02 += padRight(loc.numeroContrato, 20);

        // Imprime os 12 meses (Valor Bruto, Comissão, IRRF) -> 14 caracteres numéricos cada (sem vírgula)
        for (let m = 1; m <= 12; m++) {
          linhaT02 += padZero(loc.meses[m].bruto, 14);
          linhaT02 += padZero(loc.meses[m].comissao, 14);
          linhaT02 += padZero(loc.meses[m].imposto, 14);
        }

        linhaT02 += sequencial.toString().padStart(9, '0'); // Sequencial do registro
        txtContent += linhaT02 + '\n';
        sequencial++;
      }

      // T09 - REGISTRO TRAILER (Fim do arquivo)
      txtContent += `T09${padRight('', 60)}${sequencial.toString().padStart(9, '0')}\n`;

      // Configurar Cabeçalhos para Download do TXT
      res.setHeader('Content-disposition', `attachment; filename=DIMOB_${store.slug || 'export'}_${year}.txt`);
      res.setHeader('Content-type', 'text/plain');
      res.charset = 'UTF-8';
      
      return res.send(txtContent);

    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao gerar o arquivo TXT da DIMOB.' });
    }
  }
}