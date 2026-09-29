import express from 'express';
import cors from 'cors';
import process from 'process';
import routes from './routes'; // Importamos nossas rotas

const app = express();

app.use(cors());
app.use(express.json());

// Plugar as rotas no app
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