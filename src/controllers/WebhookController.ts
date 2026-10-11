import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import axios from 'axios';

const prisma = new PrismaClient() as any;

const EVOLUTION_API_URL = process.env.EVOLUTION_API_URL || 'http://localhost:8080';
const EVOLUTION_API_KEY = process.env.EVOLUTION_API_KEY || 'sua_api_key_global_aqui';

export class WebhookController {
  
  async receive(req: Request, res: Response) {
    try {
      const { instanceName } = req.params;
      const { body } = req;

      // Retorna 200 rápido para a Evolution API não dar timeout
      res.status(200).send('OK');

      // 1. IGNORAR EVENTOS IRRELEVANTES
      // Só queremos processar mensagens novas recebidas (MESSAGES_UPSERT)
      if (body.event !== 'messages.upsert') return;
      
      const messageData = body.data;
      if (!messageData || !messageData.message) return;

      const remoteJid = messageData.key.remoteJid;
      const fromMe = messageData.key.fromMe;
      const isGroup = remoteJid.includes('@g.us');

      // Ignora mensagens enviadas pelo próprio corretor ou vindas de grupos
      if (fromMe || isGroup) return;

      const phone = remoteJid.split('@')[0];
      const pushName = messageData.pushName || 'Cliente WhatsApp';
      
      // Extrai o texto da mensagem (pode vir em conversation ou extendedTextMessage)
      const text = messageData.message.conversation || messageData.message.extendedTextMessage?.text || '';
      if (!text) return; // Ignora se for só uma imagem/áudio sem texto por enquanto

      // 2. BUSCAR CONFIGURAÇÃO DA IMOBILIÁRIA
      const config = await prisma.whatsappConfig.findUnique({
        where: { instanceName }
      });

      if (!config || !config.botEnabled) return; // Se o robô estiver desligado, não faz nada!

      // 3. BUSCAR OU CRIAR O LEAD NO CRM
      let lead = await prisma.lead.findFirst({
        where: { 
          realEstateId: config.realEstateId,
          phone: phone
        }
      });

      // FUNÇÃO AUXILIAR PARA ENVIAR MENSAGEM PELO WHATSAPP
      const sendWhatsAppMessage = async (textMsg: string) => {
        try {
          await axios.post(`${EVOLUTION_API_URL}/message/sendText/${instanceName}`, {
            number: remoteJid,
            options: { delay: 1500, presence: "composing" }, // Simula que está digitando
            textMessage: { text: textMsg }
          }, { headers: { apikey: EVOLUTION_API_KEY } });
        } catch (error) {
          console.error(`Erro ao enviar mensagem para ${phone}:`, error);
        }
      };

      // ==========================================
      // LÓGICA DO CHATBOT DE TRIAGEM
      // ==========================================

      // SE É UM LEAD NOVO (Ainda não existe no CRM)
      if (!lead) {
        lead = await prisma.lead.create({
          data: {
            realEstateId: config.realEstateId,
            name: pushName,
            phone: phone,
            stage: 'Novo', // Entra na primeira coluna
            interest: 'Triagem Automática (WhatsApp)',
            notes: `Primeiro contato: "${text}"`
          }
        });

        // Manda a saudação e a primeira pergunta
        const saudacao = config.welcomeMessage || 'Olá! Sou o assistente virtual da imobiliária.';
        await sendWhatsAppMessage(`${saudacao}\n\nPara eu o ajudar melhor, diga-me: procura imóvel para *Comprar* ou *Alugar*?`);
        return;
      }

      // SE O LEAD JÁ EXISTE, MAS JÁ SAIU DA COLUNA "NOVO" (O corretor já está atendendo)
      // O bot desliga-se para não atrapalhar o corretor humano!
      if (lead.stage !== 'Novo') {
        return; 
      }

      // SE ESTÁ NA COLUNA "NOVO", O BOT CONTINUA A TRIAGEM (Preenchendo o Perfil de Busca)
      const userText = text.toLowerCase();

      // PERGUNTA 1: Transação (Comprar ou Alugar?)
      if (!lead.searchTransaction) {
        let transacao = '';
        if (userText.includes('comprar') || userText.includes('compra') || userText.includes('venda')) transacao = 'Venda';
        else if (userText.includes('alugar') || userText.includes('locação') || userText.includes('aluguel')) transacao = 'Locação';

        if (transacao) {
          await prisma.lead.update({ where: { id: lead.id }, data: { searchTransaction: transacao } });
          await sendWhatsAppMessage('Ótimo! E qual o *tipo* de imóvel que procura? (Ex: Casa, Apartamento, Comercial, Terreno)');
        } else {
          await sendWhatsAppMessage('Desculpe, não entendi. Você procura imóvel para *Comprar* ou *Alugar*?');
        }
        return;
      }

      // PERGUNTA 2: Tipo do Imóvel
      if (!lead.searchType) {
        let tipo = '';
        if (userText.includes('casa')) tipo = 'Casa';
        else if (userText.includes('ap') || userText.includes('apartamento')) tipo = 'Apartamento';
        else if (userText.includes('comercial') || userText.includes('sala')) tipo = 'Comercial';
        else if (userText.includes('terreno') || userText.includes('lote')) tipo = 'Terreno';

        if (tipo) {
          await prisma.lead.update({ where: { id: lead.id }, data: { searchType: tipo } });
          await sendWhatsAppMessage('Maravilha! Qual seria o seu *orçamento máximo* aproximado? (Digite apenas números, ex: 350000)');
        } else {
          await sendWhatsAppMessage('Poderia especificar o tipo? Temos: Casa, Apartamento, Comercial ou Terreno.');
        }
        return;
      }

      // PERGUNTA 3: Orçamento Máximo
      if (!lead.searchMaxPrice) {
        const numbersOnly = userText.replace(/\D/g, ''); // Extrai apenas os números
        if (numbersOnly.length > 3) { // Validação simples
          await prisma.lead.update({ where: { id: lead.id }, data: { searchMaxPrice: numbersOnly } });
          await sendWhatsAppMessage('Quase lá! Em quais *bairros* ou regiões você tem interesse?');
        } else {
          await sendWhatsAppMessage('Por favor, digite um valor aproximado usando apenas números. Ex: 2000');
        }
        return;
      }

      // PERGUNTA 4: Bairros (FINALIZAÇÃO)
      if (!lead.searchNeighborhoods || lead.searchNeighborhoods.length === 0) {
        const bairrosArray = text.split(',').map((b: string) => b.trim());
        
        await prisma.lead.update({ 
          where: { id: lead.id }, 
          data: { 
            searchNeighborhoods: bairrosArray,
            stage: 'Atendimento' // MUDA O ESTÁGIO! O BOT AGORA VAI DORMIR PARA ESTE LEAD.
          } 
        });

        await sendWhatsAppMessage('Perfeito! Já registei todo o seu perfil de busca. 🎯\n\nUm dos nossos corretores especializados vai analisar o nosso sistema agora mesmo e enviará os imóveis compatíveis em instantes. Aguarde um momento!');
        return;
      }

    } catch (error) {
      console.error('Erro no Webhook do WhatsApp:', error);
      // Já respondemos 200 lá em cima, então apenas logamos o erro
    }
  }
}