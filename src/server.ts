import express from 'express';
import cors from 'cors';
import process from 'process';

const app = express();

// Middlewares
app.use(cors());
app.use(express.json());

// Rota de Saúde (Health Check) - O Render precisa disso para saber que a API está viva
app.get('/', (req, res) => {
  res.json({ 
    status: 'online', 
    message: 'API ZenixImob Master operando com sucesso! 🚀' 
  });
});

// A porta dinâmica é OBRIGATÓRIA no Render
const PORT = process.env.PORT || 3333;

app.listen(PORT, () => {
  console.log(`🚀 Servidor rodando na porta ${PORT}`);
});