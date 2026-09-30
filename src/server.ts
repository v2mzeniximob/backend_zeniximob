import express from 'express';
import cors from 'cors';
import process from 'process';
import routes from './routes';

const app = express();

app.use(cors());
app.use(express.json());

// --- ROTA DE TESTE DIRETA NO SERVER.TS ---
app.get('/public/stores/:slug', (req, res) => {
  return res.json({ 
    success: true, 
    message: 'Rota direta a funcionar no servidor!', 
    slugRecebido: req.params.slug 
  });
});
// ----------------------------------------

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