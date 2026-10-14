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

      // Retorna HTTP 200 imediatamente para a Evolution API não gerar timeout
      res.status(200).send('OK');

      // 1. IGNORAR EVENTOS IRRELEVANTES
      const eventName = (body?.event || '').toLowerCase();
      if (eventName !== 'messages.upsert') return;

      const messageData = body?.data;
      if (!messageData || !messageData.message || !messageData.key) return;

      const remoteJid: string = messageData.key.remoteJid || '';
      const fromMe: boolean = Boolean(messageData.key.fromMe);
      const isGroup = remoteJid.includes('@g.us') || remoteJid.includes('status@broadcast');

      // Ignora mensagens enviadas pelo próprio robô, vindas de grupos ou status do WhatsApp
      if (fromMe || isGroup) return;

      const phone = remoteJid.split('@')[0];
      const pushName = messageData.pushName || 'Cliente WhatsApp';

      // Extrai o texto da mensagem (Suporta texto puro, mensagens com imagem/vídeo legendados ou resposta a mensagens)
      let text = (
        messageData.message.conversation ||
        messageData.message.extendedTextMessage?.text ||
        messageData.message.imageMessage?.caption ||
        messageData.message.videoMessage?.caption ||
        messageData.message.documentMessage?.caption ||
        ''
      ).trim();

      // FUNÇÃO AUXILIAR PARA ENVIAR MENSAGEM PELO WHATSAPP (Evolution API)
      const sendWhatsAppMessage = async (textMsg: string) => {
        try {
          await axios.post(
            `${EVOLUTION_API_URL}/message/sendText/${instanceName}`,
            {
              number: remoteJid,
              text: textMsg,
              delay: 1200
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
          console.error(`[Webhook] Erro ao enviar mensagem para ${phone}:`, error?.response?.data || error.message);
        }
      };

      // Se o cliente enviou áudio, figurinha ou documento sem legenda de texto
      if (!text) {
        console.log(`[Webhook] Mensagem sem texto (Mídia/Áudio) recebida de: ${phone}`);
        // Avisa o cliente para interagir por texto para prosseguir a triagem
        await sendWhatsAppMessage('Recebi o seu arquivo/áudio! 🎧\n\nPor favor, envie uma mensagem em **texto** com a sua dúvida ou com o **código do imóvel** para que o nosso robô possa ajudá-lo.');
        return;
      }

      console.log(`[Webhook] Mensagem recebida [Instância: ${instanceName}] de ${phone} (${pushName}): "${text}"`);

      // 2. BUSCAR CONFIGURAÇÃO DA IMOBILIÁRIA
      const config = await prisma.whatsappConfig.findUnique({
        where: { instanceName }
      });

      if (!config) {
        console.warn(`[Webhook] Instância "${instanceName}" não está cadastrada na tabela whatsappConfig.`);
        return;
      }

      if (!config.botEnabled) {
        console.log(`[Webhook] O Bot está desativado no painel da imobiliária para a instância: ${instanceName}`);
        return;
      }

      // 3. BUSCAR O LEAD NO CRM
      let lead = await prisma.lead.findFirst({
        where: {
          realEstateId: config.realEstateId,
          phone: phone
        }
      });

      // COMANDO DE TESTE/DESENVOLVIMENTO: Se você digitar #reset ou reiniciar, volta o Lead para 'Novo'
      if (text.toLowerCase() === '#reset' || text.toLowerCase() === 'reiniciar') {
        if (lead) {
          await prisma.lead.update({
            where: { id: lead.id },
            data: {
              stage: 'Novo',
              searchTransaction: null,
              searchType: null,
              searchMaxPrice: null,
              searchNeighborhoods: []
            }
          });
          await sendWhatsAppMessage('🔄 *Triagem Reiniciada para Testes!* Pode enviar uma nova mensagem.');
          return;
        }
      }

      // ==========================================
      // LÓGICA DO CHATBOT COM BUSCA DE CÓDIGO + TRIAGEM
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
            interest: 'Contato Inicial (WhatsApp)',
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
              ? `🤖 Lead captado no WhatsApp e atribuído pela Roleta para: ${brokerAssignedName}.`
              : `🤖 Lead iniciou conversa no WhatsApp.`
          }
        });

        const saudacao = config.welcomeMessage || 'Olá! Sou o assistente virtual da imobiliária.';
        await sendWhatsAppMessage(`${saudacao}\n\nVocê viu algum imóvel específico no nosso site? Se sim, por favor, envie o **código do imóvel**. Caso contrário, digite **'não'** para procurarmos juntos!`);
        return;
      }

      // SE O LEAD JÁ EXISTE, MAS JÁ SAIU DA COLUNA "NOVO" (Atendimento humano ativo)
      if (lead.stage !== 'Novo') {
        console.log(`[Webhook] Lead ${phone} já está no estágio "${lead.stage}". Robô em modo silencioso para permitir atendimento humano.`);
        return;
      }

      const userText = text.toLowerCase();

      // PASSO 0: Verificar se o lead está respondendo sobre o Código do Imóvel do Site
      if (lead.searchTransaction === null || lead.searchTransaction === 'PENDING') {
        // Limpa caracteres especiais do código para facilitar a busca (Ex: #AP1023 -> AP1023)
        const cleanCode = text.replace(/[#\s]/g, '').trim();
        const isNegative = userText.includes('não') || userText.includes('nao') || userText.includes('na') || userText.includes('nenhum');

        if (isNegative) {
          await prisma.lead.update({
            where: { id: lead.id },
            data: { searchTransaction: 'PENDING_CHOICE' }
          });
          await sendWhatsAppMessage('Sem problemas! Para eu ajudá-lo melhor, você procura um imóvel para **Comprar** ou **Alugar**?');
          return;
        }

        // Tenta buscar o imóvel pelo código no banco de dados da imobiliária
        const property = await prisma.property.findFirst({
          where: {
            realEstateId: config.realEstateId,
            OR: [
              { code: { equals: cleanCode, mode: 'insensitive' } },
              { id: cleanCode }
            ]
          }
        });

        if (property) {
          // Imóvel encontrado! Vincula o lead ao imóvel e já direciona para atendimento humano
          await prisma.lead.update({
            where: { id: lead.id },
            data: {
              interest: `Imóvel Cód: ${property.code || property.id} (${property.title || 'Imóvel'})`,
              searchTransaction: property.type === 'RENT' ? 'Locação' : 'Venda',
              searchType: property.category || property.type,
              stage: 'Atendimento', // Vai direto para atendimento humano com o imóvel identificado!
              notes: (lead.notes || '') + `\nCliente demonstrou interesse direto no imóvel código ${cleanCode}: ${property.title}`
            }
          });

          await prisma.leadHistory.create({
            data: {
              leadId: lead.id,
              actionType: 'WhatsApp',
              description: `🎯 Cliente informou o código do imóvel: ${cleanCode} (${property.title || 'Imóvel'}). Lead direcionado para atendimento humano!`
            }
          });

          await sendWhatsAppMessage(`Encontrei o imóvel! 🏠 *${property.title || 'Imóvel'}* (Cód: ${cleanCode}).\n\nJá registei o seu interesse e encaminhei para o corretor responsável, que entrará em contacto em instantes com todos os detalhes e para agendar a sua visita. Obrigado!`);
          return;
        } else {
          // Se digitou algo mas não é um código válido e não disse "não"
          await prisma.lead.update({
            where: { id: lead.id },
            data: { searchTransaction: 'PENDING_CHOICE' }
          });
          await sendWhatsAppMessage(`Não encontrei nenhum imóvel ativo com o código "${cleanCode}".\n\nDeseja procurar imóvel para **Comprar** ou **Alugar**?`);
          return;
        }
      }

      // PERGUNTA 1: Transação (Comprar ou Alugar?)
      if (lead.searchTransaction === 'PENDING_CHOICE' || !lead.searchTransaction) {
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
            stage: 'Atendimento' // Triagem concluída: move para Atendimento e passa o bastão para o humano
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
      console.error('[Webhook] Erro não tratado no Webhook do WhatsApp:', error);
    }
  }
}