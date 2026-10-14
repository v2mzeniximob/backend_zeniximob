import express from 'express';
import cors from 'cors';
import process from 'process';
import path from 'path'; 
import { PrismaClient } from '@prisma/client';
import cron from 'node-cron';
import { SeasonIcalController } from './controllers/SeasonIcalController';
import routes from './routes';

const app = express();
const prisma = new PrismaClient();

app.use(cors());
app.use(express.json());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// ==========================================
// LIBERTAR ACESSO PÚBLICO À PASTA DE UPLOADS
// ==========================================
app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));

// ==========================================
// 1. ROTA PÚBLICA DA VITRINE DA LOJA
// ==========================================
app.get('/public/stores/:slug', async (req, res) => {
  try {
    const { slug } = req.params;

    const realEstate = await prisma.realEstate.findFirst({
      where: { 
        slug: slug.trim(), 
        isActive: true 
      }
    });

    if (!realEstate) {
      return res.status(404).json({ error: 'Imobiliária não encontrada ou inativa.' });
    }

    const allProperties = await prisma.property.findMany({
      where: { 
        realEstateId: realEstate.id,
        isActive: true
      },
      orderBy: { 
        createdAt: 'desc' 
      }
    });

    // Filtro rigoroso no backend para garantir que nenhum imóvel vendido ou alugado passe
    const properties = allProperties.filter((p: any) => {
      const kStat = (p.keyStatus || '').toLowerCase();
      const rStat = (p.rentStatus || '').toLowerCase();
      const stat = (p.status || '').toLowerCase();

      const isUnavailable = 
        kStat.includes('vendido') || kStat.includes('alugado') ||
        rStat.includes('vendido') || rStat.includes('alugado') ||
        stat.includes('vendido') || stat.includes('alugado');

      return !isUnavailable;
    });

    return res.json({ realEstate, properties });
  } catch (error: any) {
    console.error('Erro ao buscar vitrine pública:', error);
    return res.status(500).json({ error: 'Erro interno ao carregar a vitrine da imobiliária.' });
  }
});

// ==========================================
// 2. ROTA PÚBLICA DE DETALHES DO IMÓVEL
// ==========================================
app.get('/public/stores/:slug/properties/:propertyId', async (req, res) => {
  try {
    const { slug, propertyId } = req.params;

    const realEstate = await prisma.realEstate.findFirst({
      where: { slug: slug.trim(), isActive: true }
    });

    if (!realEstate) {
      return res.status(404).json({ error: 'Imobiliária não encontrada.' });
    }

    const property = await prisma.property.findFirst({
      where: { 
        id: propertyId,
        realEstateId: realEstate.id,
        isActive: true 
      },
      include: {
        broker: true
      }
    });

    if (!property) {
      return res.status(404).json({ error: 'Imóvel não encontrado.' });
    }

    return res.json({ realEstate, property });
  } catch (error) {
    console.error('Erro ao buscar detalhes do imóvel:', error);
    return res.status(500).json({ error: 'Erro interno ao carregar imóvel.' });
  }
});

// Plugar as restantes rotas
app.use(routes);

app.get('/', (req, res) => {
  res.json({ 
    status: 'online', 
    message: 'API ZenixImob Master operando com sucesso! 🚀' 
  });
});

const PORT = process.env.PORT || 3333;

app.listen(PORT, () => {
  console.log(`🚀 Servidor rodando na porta ${PORT}`);

  // ==========================================
  // CRON JOB: Sincronização iCal (Airbnb / Booking) a cada 15 minutos
  // ==========================================
  cron.schedule('*/15 * * * *', () => {
    SeasonIcalController.syncAllProperties();
  });
  console.log('⏰ Cron Job de Sincronização iCal configurado (rodando a cada 15 min).');
});