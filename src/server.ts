import express from 'express';
import cors from 'cors';
import process from 'process';
import { PrismaClient } from '@prisma/client';
import routes from './routes';

const app = express();
const prisma = new PrismaClient();

app.use(cors());
app.use(express.json());

// ==========================================
// ROTA PÚBLICA DA VITRINE (Direta no Server)
// ==========================================
app.get('/public/stores/:slug', async (req, res) => {
  try {
    const { slug } = req.params;

    // 1. Buscar a imobiliária pelo slug
    const realEstate = await prisma.realEstate.findFirst({
      where: { 
        slug: slug.trim(), 
        isActive: true 
      }
    });

    if (!realEstate) {
      return res.status(404).json({ error: 'Imobiliária não encontrada ou inativa.' });
    }

    // 2. Buscar os imóveis associados a esta imobiliária
    const properties = await prisma.property.findMany({
      where: { 
        realEstateId: realEstate.id 
      },
      orderBy: { 
        createdAt: 'desc' 
      }
    });

    return res.json({ 
      realEstate, 
      properties 
    });
  } catch (error: any) {
    console.error('Erro ao buscar vitrine pública:', error);
    return res.status(500).json({ error: 'Erro interno ao carregar a vitrine da imobiliária.' });
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