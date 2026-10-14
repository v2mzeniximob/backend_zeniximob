import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import icalGenerator, { ICalCalendarMethod } from 'ical-generator';
import ical from 'node-ical';
import axios from 'axios';

const prisma = new PrismaClient() as any;

export class SeasonIcalController {

  // ==========================================
  // 1. EXPORTAR ICAL (Disponibiliza o .ics para Airbnb/Booking lerem)
  // URL Exemplo: GET /public/properties/:propertyId/ical/:token.ics
  // ==========================================
  async exportIcal(req: Request, res: Response) {
    try {
      const propertyId = String(req.params.propertyId);
      const tokenParam = String(req.params.token || '');

      const property = await prisma.property.findUnique({
        where: { id: propertyId }
      });

      const cleanToken = tokenParam.replace('.ics', '');

      if (!property || (property.icalExportToken && property.icalExportToken !== cleanToken)) {
        return res.status(404).send('Calendário não encontrado ou token inválido.');
      }

      // Busca todas as reservas ativas deste imóvel
      const bookings = await prisma.seasonBooking.findMany({
        where: {
          propertyId: propertyId,
          status: { not: 'CANCELLED' }
        }
      });

      const calendar = icalGenerator({
        name: `Calendário - ${property.title || 'Imóvel'}`,
        timezone: 'America/Sao_Paulo',
        method: ICalCalendarMethod.PUBLISH
      });

      bookings.forEach((booking: any) => {
        calendar.createEvent({
          id: booking.externalUid || booking.id,
          start: new Date(booking.checkIn),
          end: new Date(booking.checkOut),
          summary: booking.source === 'DIRECT' 
            ? `Reserva Direta - ${booking.guestName || 'Hóspede'}`
            : `Reservado (${booking.source})`,
          description: `Reserva confirmada via ${booking.source}.`,
          location: property.address || ''
        });
      });

      res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="property-${propertyId}.ics"`);
      return res.status(200).send(calendar.toString());

    } catch (error) {
      console.error('[iCal Export] Erro ao gerar iCal:', error);
      return res.status(500).send('Erro interno ao exportar calendário.');
    }
  }

  // ==========================================
  // 2. SALVAR LINKS ICAL DAS OTAS NO IMÓVEL
  // URL Exemplo: PUT /properties/:id/ical-links
  // ==========================================
  async updateIcalLinks(req: Request, res: Response) {
    try {
      const id = String(req.params.id);
      const { airbnbIcalUrl, bookingIcalUrl, vrboIcalUrl } = req.body;

      const property = await prisma.property.update({
        where: { id },
        data: {
          airbnbIcalUrl: airbnbIcalUrl || null,
          bookingIcalUrl: bookingIcalUrl || null,
          vrboIcalUrl: vrboIcalUrl || null
        }
      });

      // Dispara uma sincronização imediata
      await SeasonIcalController.syncPropertyIcal(id);

      return res.json({ message: 'Links iCal atualizados e sincronizados com sucesso!', property });
    } catch (error: any) {
      console.error('[iCal Sync] Erro ao salvar links:', error);
      return res.status(500).json({ error: 'Erro ao salvar links iCal.' });
    }
  }

  // ==========================================
  // 3. LÓGICA DE IMPORTAÇÃO & SINCRONIZAÇÃO (OTAs -> Banco de Dados)
  // ==========================================
  static async syncPropertyIcal(propertyId: string) {
    try {
      const property = await prisma.property.findUnique({
        where: { id: String(propertyId) }
      });

      if (!property) return;

      const channels = [
        { source: 'AIRBNB', url: property.airbnbIcalUrl },
        { source: 'BOOKING', url: property.bookingIcalUrl },
        { source: 'VRBO', url: property.vrboIcalUrl }
      ];

      for (const channel of channels) {
        if (!channel.url) continue;

        try {
          // Baixa o arquivo .ics da OTA
          const response = await axios.get(channel.url, { timeout: 10000 });
          const events: any = ical.parseICS(response.data);

          for (const k in events) {
            if (!Object.prototype.hasOwnProperty.call(events, k)) continue;
            const ev = events[k];

            if (ev && ev.type === 'VEVENT') {
              const startDate = ev.start ? new Date(ev.start) : null;
              const endDate = ev.end ? new Date(ev.end) : null;

              if (!startDate || !endDate) continue;

              const uid = ev.uid || `${channel.source}_${startDate.getTime()}`;
              const checkIn = startDate;
              const checkOut = endDate;

              // Verifica se essa reserva da OTA já foi gravada no nosso banco
              const existing = await prisma.seasonBooking.findFirst({
                where: {
                  propertyId: property.id,
                  OR: [
                    { externalUid: uid },
                    { checkIn, checkOut }
                  ]
                }
              });

              if (!existing) {
                // Cria o bloqueio de datas vindo da OTA
                await prisma.seasonBooking.create({
                  data: {
                    propertyId: property.id,
                    externalUid: uid,
                    source: channel.source,
                    guestName: ev.summary || `Reserva ${channel.source}`,
                    checkIn,
                    checkOut,
                    status: 'CONFIRMED',
                    notes: `Sincronizado automaticamente via iCal (${channel.source})`
                  }
                });
              }
            }
          }
        } catch (err: any) {
          console.error(`[iCal Sync] Erro ao baixar iCal da OTA ${channel.source} para o imóvel ${propertyId}:`, err.message);
        }
      }

      await prisma.property.update({
        where: { id: property.id },
        data: { lastIcalSyncAt: new Date() }
      });

    } catch (error) {
      console.error(`[iCal Sync] Erro ao sincronizar imóvel ${propertyId}:`, error);
    }
  }

  // ==========================================
  // 4. SINCRONIZAR TODOS OS IMÓVEIS (Para o Cron Job)
  // ==========================================
  static async syncAllProperties() {
    console.log('[iCal Cron] Iniciando sincronização automática de calendários...');
    const properties = await prisma.property.findMany({
      where: {
        OR: [
          { airbnbIcalUrl: { not: null } },
          { bookingIcalUrl: { not: null } },
          { vrboIcalUrl: { not: null } }
        ]
      },
      select: { id: true }
    });

    for (const prop of properties) {
      await SeasonIcalController.syncPropertyIcal(prop.id);
    }
    console.log(`[iCal Cron] Sincronização concluída para ${properties.length} imóveis.`);
  }
}