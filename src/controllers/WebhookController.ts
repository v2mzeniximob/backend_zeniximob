import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import axios from 'axios';
import { pickNextBrokerInRoulette } from './LeadController';

const prisma = new PrismaClient() as any;

const EVOLUTION_API_URL = (process.env.EVOLUTION_API_URL || 'http://localhost:8080').replace(/\/$/, '');
const EVOLUTION_API_KEY = process.env.EVOLUTION_API_KEY || 'ZenixMasterKey2026!';

export class WebhookController {

  async receive(req: Request, res: Response) {
    try {
      const { instanceName } = req.params;
      const { body } = req;

      // Retorna 200 rápido para a Evolution API não dar timeout
      res.status(200).send('OK');

      // 1. IGNORAR EVENTOS IRRELEVANTES
      const eventName = (body?.event || '').toLowerCase();
      if (eventName !== 'messages.upsert') return;

      const messageData = body.data;
      if (!messageData || !messageData.message || !messageData.key) return;

      const remoteJid: string = messageData.key.remoteJid || '';
      const fromMe: boolean = Boolean(messageData.key.fromMe);
      const isGroup = remoteJid.includes('@g.us') || remoteJid.includes('status@broadcast');

      // Ignora mensagens enviadas pelo próprio número ou vindas de grupos/status
      if (fromMe || isGroup) return;

      const phone = remoteJid.split('@')[0];
      const pushName = messageData.pushName || 'Cliente WhatsApp';

      // Extrai o texto da mensagem
      const text = (
        messageData.message.conversation ||
        messageData.message.extendedTextMessage?.text ||
        ''
      ).trim();

      if (!text) return;

      // 2. BUSCAR CONFIGURAÇÃO DA IMOBILIÁRIA
      const config = await prisma.whatsappConfig.findUnique({
        where: { instanceName }
      });

      if (!config || !config.botEnabled) return;

      // 3. BUSCAR O LEAD NO CRM
      let lead = await prisma.lead.findFirst({
        where: {
          realEstateId: config.realEstateId,
          phone: phone
        }
      });

      // FUNÇÃO AUXILIAR PARA ENVIAR MENSAGEM PELO WHATSAPP (Evolution API v2.2.3)
      const sendWhatsAppMessage = async (textMsg: string) => {
        try {
          await axios.post(
            `${EVOLUTION_API_URL}/message/sendText/${instanceName}`,
            {
              number: remoteJid,
              text: textMsg,
              delay: 1500
            },
            {
              headers: {
                apikey: EVOLUTION_API_KEY,
                'Content-Type': 'application/json',
                'ngrok-skip-browser-warning': 'true'
              }
            }
          );
        } catch (error: any) {
          console.error(`Erro ao enviar mensagem para ${phone}:`, error?.response?.data || error.message);
        }
      };

      // ==========================================
      // LÓGICA DO CHATBOT DE TRIAGEM + ROLETA
      // ==========================================

      // SE É UM LEAD NOVO (Ainda não existe no CRM)
      if (!lead) {
        let finalBrokerId: string | null = null;
        let brokerAssignedName: string | null = null;

        // Verifica se a Roleta da Imobiliária está ativa para sortear o corretor
        const store = await prisma.realEstate.findUnique({
          where: { id: config.realEstateId },
          select: { rouletteEnabled: true }
        });

        if (store?.rouletteEnabled) {
          const picked = await pickNextBrokerInRoulette(config.realEstateId);
          if (picked) {
            finalBrokerId = picked.id;
            brokerAssignedName = picked.name;
          }
        }

        lead = await prisma.lead.create({
          data: {
            realEstateId: config.realEstateId,
            name: pushName,
            phone: phone,
            stage: 'Novo',
            status: 'Novo',
            interest: 'Triagem Automática (WhatsApp)',
            notes: `Primeiro contato via WhatsApp: "${text}"`,
            brokerId: finalBrokerId,
            assignedAt: new Date(),
            firstContactAt: null,
            reassignedCount: 0
          }
        });

        await prisma.leadHistory.create({
          data: {
            leadId: lead.id,
            actionType: 'WhatsApp',
            description: brokerAssignedName
              ? `🤖 Lead captado no WhatsApp ("${text}") e atribuído pela Roleta para: ${brokerAssignedName}.`
              : `🤖 Lead iniciou conversa no WhatsApp: "${text}".`
          }
        });

        const saudacao = config.welcomeMessage || 'Olá! Sou o assistente virtual da imobiliária.';
        await sendWhatsAppMessage(`${saudacao}\n\nPara eu o ajudar melhor, diga-me: procura imóvel para *Comprar* ou *Alugar*?`);
        return;
      }

      // SE O LEAD JÁ EXISTE, MAS JÁ SAIU DA COLUNA "NOVO" (O corretor já está atendendo)
      if (lead.stage !== 'Novo') {
        return;
      }

      const userText = text.toLowerCase();

      // PERGUNTA 1: Transação (Comprar ou Alugar?)
      if (!lead.searchTransaction) {
        let transacao = '';
        if (userText.includes('comprar') || userText.includes('compra') || userText.includes('venda')) transacao = 'Venda';
        else if (userText.includes('alugar') || userText.includes('locação') || userText.includes('locacao') || userText.includes('aluguel')) transacao = 'Locação';

        if (transacao) {
          await prisma.lead.update({
            where: { id: lead.id },
            data: { searchTransaction: transacao, interest: transacao === 'Venda' ? 'Comprador' : 'Inquilino' }
          });
          await sendWhatsAppMessage('Ótimo! E qual o *tipo* de imóvel que procura? (Ex: Casa, Apartamento, Comercial, Terreno)');
        } else {
          await sendWhatsAppMessage('Desculpe, não entendi. Você procura imóvel para *Comprar* ou *Alugar*?');
        }
        return;
      }

      // PERGUNTA 2: Tipo do Imóvel
      if (!lead.searchType) {
        let tipo = '';
        if (userText.includes('casa') || userText.includes('sobrado')) tipo = 'Casa';
        else if (userText.includes('ap') || userText.includes('apartamento') || userText.includes('kitnet')) tipo = 'Apartamento';
        else if (userText.includes('comercial') || userText.includes('sala') || userText.includes('galpão') || userText.includes('loja')) tipo = 'Comercial';
        else if (userText.includes('terreno') || userText.includes('lote')) tipo = 'Terreno';

        if (tipo) {
          await prisma.lead.update({ where: { id: lead.id }, data: { searchType: tipo } });
          await sendWhatsAppMessage('Maravilha! Qual seria o seu *orçamento máximo* aproximado? (Digite apenas números, ex: 350000 ou 2500)');
        } else {
          await sendWhatsAppMessage('Poderia especificar o tipo? Temos: *Casa*, *Apartamento*, *Comercial* ou *Terreno*.');
        }
        return;
      }

      // PERGUNTA 3: Orçamento Máximo
      if (!lead.searchMaxPrice) {
        const numbersOnly = userText.replace(/\D/g, '');
        const numericPrice = Number(numbersOnly);

        if (numbersOnly.length >= 3 && numericPrice > 0) {
          await prisma.lead.update({
            where: { id: lead.id },
            data: { searchMaxPrice: numericPrice }
          });
          await sendWhatsAppMessage('Quase lá! Em quais *bairros* ou regiões você tem interesse? (Pode separar por vírgula)');
        } else {
          await sendWhatsAppMessage('Por favor, digite um valor aproximado usando apenas números. Ex: 2500 ou 350000');
        }
        return;
      }

      // PERGUNTA 4: Bairros (FINALIZAÇÃO DA TRIAGEM)
      if (!lead.searchNeighborhoods || lead.searchNeighborhoods.length === 0) {
        const bairrosArray = text.split(',').map((b: string) => b.trim()).filter(Boolean);

        await prisma.lead.update({
          where: { id: lead.id },
          data: {
            searchNeighborhoods: bairrosArray,
            stage: 'Atendimento' // Triagem concluída: move para Atendimento e desativa o bot para este cliente
          }
        });

        await prisma.leadHistory.create({
          data: {
            leadId: lead.id,
            actionType: 'WhatsApp',
            description: `🎯 Triagem concluída pelo Robô IA! Busca: ${lead.searchType} para ${lead.searchTransaction} até R$ ${Number(lead.searchMaxPrice).toLocaleString('pt-BR')} nos bairros: ${bairrosArray.join(', ')}.`
          }
        });

        await sendWhatsAppMessage('Perfeito! Já registei todo o seu perfil de busca. 🎯\n\nUm dos nossos corretores especializados já recebeu a sua ficha e enviará os imóveis compatíveis em instantes!');
        return;
      }

    } catch (error) {
      console.error('Erro no Webhook do WhatsApp:', error);
    }
  }
}