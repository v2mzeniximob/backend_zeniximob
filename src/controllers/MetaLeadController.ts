import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { pickNextBrokerInRoulette } from './LeadController';
import axios from 'axios';

const prisma = new PrismaClient() as any;

export class MetaLeadController {
  
  // ==========================================
  // WEBHOOK PARA RECEBER LEADS DO FACEBOOK / INSTAGRAM (META)
  // Rota: POST /webhook/meta-leads/:realEstateId
  // ==========================================
  async receiveMetaLead(req: Request, res: Response) {
    try {
      const realEstateIdParam = req.params.realEstateId;
      const realEstateId = Array.isArray(realEstateIdParam)
        ? realEstateIdParam[0] ?? ''
        : realEstateIdParam;
      const body = req.body;

      // Validação básica do payload da Meta (Graph API / Lead Ads)
      const entry = body.entry?.[0];
      const change = entry?.changes?.[0];
      const leadgenId = change?.value?.leadgen_id;
      const formId = change?.value?.form_id;

      if (!leadgenId) {
        return res.status(400).json({ error: 'Payload do Meta Lead Ads inválido ou sem leadgen_id.' });
      }

      const leadData = change?.value?.field_data || [];
      let name = 'Lead Instagram / Facebook';
      let phoneStr = '';
      let emailStr = '';

      leadData.forEach((field: any) => {
        const val = field.values?.[0];
        if (field.name === 'full_name' || field.name === 'name') name = val;
        if (field.name === 'phone_number' || field.name === 'phone') {
          phoneStr = Array.isArray(val) ? val[0] : (val || '');
        }
        if (field.name === 'email') emailStr = Array.isArray(val) ? val[0] : (val || '');
      });

      const phone = String(phoneStr || '(00) 00000-0000');
      const email = emailStr ? String(emailStr) : null;

      // Verifica se a roleta da imobiliária está ativa para distribuir o lead
      const store = await prisma.realEstate.findUnique({
        where: { id: realEstateId },
        select: { rouletteEnabled: true }
      }).catch(() => null);

      let assignedBrokerId: string | null = null;
      let assignedBrokerName: string | null = null;

      if (store?.rouletteEnabled) {
        const picked = await pickNextBrokerInRoulette(realEstateId);
        if (picked) {
          assignedBrokerId = picked.id;
          assignedBrokerName = picked.name;
        }
      }

      // Cria o lead no banco de dados
      const newLead = await prisma.lead.create({
        data: {
          realEstateId,
          name,
          phone,
          email,
          interest: 'Meta Lead Ads (Instagram/Facebook)',
          status: 'Novo',
          stage: 'Novo',
          notes: `Lead capturado via Anúncio Meta (Form ID: ${formId || 'N/A'})`,
          brokerId: assignedBrokerId,
          assignedAt: new Date(),
          reassignedCount: 0
        }
      });

      // Registra no histórico do lead
      await prisma.leadHistory.create({
        data: {
          leadId: newLead.id,
          actionType: 'Meta Ads',
          description: assignedBrokerName
            ? `🎯 Lead integrado via Instagram/Facebook Ads e atribuído via Roleta para: ${assignedBrokerName}.`
            : '🎯 Lead integrado via Instagram/Facebook Ads.'
        }
      }).catch(() => {});

      // Disparo automático via WhatsApp (Evolution API se configurado na loja)
      const whatsappConfig = await prisma.whatsappConfig.findUnique({
        where: { realEstateId }
      }).catch(() => null);

      if (whatsappConfig && whatsappConfig.status === 'CONNECTED' && phone) {
        const cleanPhone = phone.replace(/\D/g, '');
        await axios.post(
          `https://api.evolution.com/message/sendText/${whatsappConfig.instanceName}`,
          {
            number: cleanPhone,
            text: `Olá ${name}! Vimos seu interesse em nossos imóveis através do nosso anúncio no Instagram/Facebook. Como podemos te ajudar hoje?`
          },
          { headers: { apikey: process.env.EVOLUTION_API_KEY || '' } }
        ).catch(err => console.error('[MetaLead] Erro ao enviar WhatsApp automático:', err.message));
      }

      return res.status(200).json({ success: true, leadId: newLead.id });
    } catch (error) {
      console.error('[MetaLead] Erro ao processar webhook do Facebook Leads:', error);
      return res.status(500).json({ error: 'Erro ao processar lead do Meta.' });
    }
  }
}