import express from 'express';
import cors from 'cors';
import process from 'process';
import path from 'path'; 
import { PrismaClient } from '@prisma/client';
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
// Isto diz ao Express para permitir a leitura de ficheiros que estão na pasta "uploads"
app.use('/uploads', express.static(path.resolve(__dirname, '..', 'uploads')));

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

    const properties = await prisma.property.findMany({
      where: { 
        realEstateId: realEstate.id 
      },
      orderBy: { 
        createdAt: 'desc' 
      }
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
        broker: true // Traz os dados do corretor responsável
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
});