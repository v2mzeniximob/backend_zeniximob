import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import axios from 'axios';

const prisma = new PrismaClient() as any;

// ==============================================================
// CONFIGURAÇÕES DA EVOLUTION API
// ==============================================================
const EVOLUTION_API_URL = (process.env.EVOLUTION_API_URL || 'http://localhost:8080').replace(/\/$/, '');
const EVOLUTION_API_KEY = process.env.EVOLUTION_API_KEY || 'ZenixMasterKey2026!';
const ZENIX_WEBHOOK_URL = (
  process.env.BACKEND_URL ||
  process.env.APP_URL ||
  'https://backend-zeniximob.onrender.com'
).replace(/\/$/, '');

const evoHeaders = {
  apikey: EVOLUTION_API_KEY,
  'Content-Type': 'application/json',
  'ngrok-skip-browser-warning': 'true'
};

export class WhatsappController {

  // 1. BUSCAR STATUS ATUAL E CONFIGURAÇÕES DO BOT
  async getStatus(req: Request, res: Response) {
    try {
      const user = req.user as any;
      const realEstateId = user?.realEstateId || user?.id;

      let config = await prisma.whatsappConfig.findUnique({
        where: { realEstateId }
      });

      // Se a imobiliária ainda não tem configuração, cria uma padrão
      if (!config) {
        config = await prisma.whatsappConfig.create({
          data: {
            realEstateId,
            instanceName: `zenix_${realEstateId.substring(0, 8)}`,
            status: 'DISCONNECTED',
            botEnabled: false,
            welcomeMessage: 'Olá! Sou o assistente virtual da imobiliária. Como posso ajudar hoje?'
          }
        });
      }

      // Sincronização em Tempo Real com a Evolution API
      if (config.status !== 'DISCONNECTED') {
        try {
          const evoRes = await axios.get(
            `${EVOLUTION_API_URL}/instance/connectionState/${config.instanceName}`,
            { headers: evoHeaders }
          );

          const state = evoRes.data?.instance?.state || evoRes.data?.state;

          if (state === 'open' && config.status !== 'CONNECTED') {
            config = await prisma.whatsappConfig.update({
              where: { id: config.id },
              data: { status: 'CONNECTED', qrCodeBase64: null }
            });
          } else if (state === 'close' && config.status === 'CONNECTED') {
            config = await prisma.whatsappConfig.update({
              where: { id: config.id },
              data: { status: 'DISCONNECTED', qrCodeBase64: null }
            });
          }
        } catch (err) {
          // Se a instância não existe na Evolution, força status desconectado
          config = await prisma.whatsappConfig.update({
            where: { id: config.id },
            data: { status: 'DISCONNECTED', qrCodeBase64: null }
          });
        }
      }

      return res.json(config);
    } catch (error) {
      console.error('Erro ao buscar status do WhatsApp:', error);
      return res.status(500).json({ error: 'Erro interno ao buscar status.' });
    }
  }

  // 2. CONECTAR / GERAR QR CODE (Compatível com Evolution API v2.2.3)
  async connect(req: Request, res: Response) {
    try {
      const user = req.user as any;
      const realEstateId = user?.realEstateId || user?.id;

      let config = await prisma.whatsappConfig.findUnique({ where: { realEstateId } });
      if (!config) return res.status(404).json({ error: 'Configuração não encontrada.' });

      const webhookUrl = `${ZENIX_WEBHOOK_URL}/webhook/whatsapp/${config.instanceName}`;

      // Limpa qualquer sessão anterior travada com o mesmo nome antes de gerar novo QR Code
      try {
        await axios.delete(`${EVOLUTION_API_URL}/instance/delete/${config.instanceName}`, {
          headers: evoHeaders
        });
      } catch (e) {
        // Ignora se a instância ainda não existia
      }

      // Cria a instância na Evolution API v2.2.3 já com o Webhook configurado
      const response = await axios.post(
        `${EVOLUTION_API_URL}/instance/create`,
        {
          instanceName: config.instanceName,
          qrcode: true,
          integration: 'WHATSAPP-BAILEYS',
          webhook: {
            url: webhookUrl,
            byEvents: false,
            base64: false,
            events: ['MESSAGES_UPSERT']
          }
        },
        { headers: evoHeaders }
      );

      let qrCode =
        response.data?.qrcode?.base64 ||
        response.data?.base64 ||
        null;

      // Caso a Evolution não devolva o base64 no create, busca no endpoint connect
      if (!qrCode) {
        const connectRes = await axios.get(
          `${EVOLUTION_API_URL}/instance/connect/${config.instanceName}`,
          { headers: evoHeaders }
        );
        qrCode = connectRes.data?.base64 || connectRes.data?.qrcode?.base64 || null;
      }

      // Atualiza a base de dados
      config = await prisma.whatsappConfig.update({
        where: { id: config.id },
        data: {
          status: 'QR_READY',
          qrCodeBase64: qrCode
        }
      });

      return res.json(config);
    } catch (error: any) {
      console.error('Erro ao conectar com Evolution API:', error?.response?.data || error.message);
      return res.status(500).json({ error: 'Falha ao comunicar com o servidor de WhatsApp.' });
    }
  }

  // 3. DESCONECTAR / EXCLUIR INSTÂNCIA
  async disconnect(req: Request, res: Response) {
    try {
      const user = req.user as any;
      const realEstateId = user?.realEstateId || user?.id;

      const config = await prisma.whatsappConfig.findUnique({ where: { realEstateId } });
      if (!config) return res.status(404).json({ error: 'Configuração não encontrada.' });

      try {
        await axios.delete(`${EVOLUTION_API_URL}/instance/logout/${config.instanceName}`, {
          headers: evoHeaders
        });
      } catch (err) {}

      try {
        await axios.delete(`${EVOLUTION_API_URL}/instance/delete/${config.instanceName}`, {
          headers: evoHeaders
        });
      } catch (err) {
        console.warn('Instância já não existia na Evolution API ou falhou ao apagar.');
      }

      const updatedConfig = await prisma.whatsappConfig.update({
        where: { id: config.id },
        data: {
          status: 'DISCONNECTED',
          qrCodeBase64: null
        }
      });

      return res.json(updatedConfig);
    } catch (error) {
      console.error('Erro ao desconectar:', error);
      return res.status(500).json({ error: 'Erro ao desconectar o WhatsApp.' });
    }
  }

  // 4. ATUALIZAR CONFIGURAÇÕES DO ROBÔ (BotEnabled e WelcomeMessage)
  async updateSettings(req: Request, res: Response) {
    try {
      const user = req.user as any;
      const realEstateId = user?.realEstateId || user?.id;
      const { botEnabled, welcomeMessage } = req.body;

      const updatedConfig = await prisma.whatsappConfig.update({
        where: { realEstateId },
        data: {
          botEnabled: Boolean(botEnabled),
          welcomeMessage
        }
      });

      return res.json(updatedConfig);
    } catch (error) {
      console.error('Erro ao salvar configurações do robô:', error);
      return res.status(500).json({ error: 'Erro ao salvar configurações.' });
    }
  }
}