// Caminho: src/controllers/AiController.ts
import { Request, Response } from 'express';

export class AiController {
  async generateDescription(req: Request, res: Response) {
    try {
      const { type, neighborhood, city, bedrooms, suites, garage, price, transaction, features } = req.body;

      // Monta o prompt para a IA
      const prompt = `
        Aja como um corretor de imóveis de luxo e especialista em copywriting (textos persuasivos para vendas).
        Escreva uma descrição atraente para um anúncio imobiliário com os seguintes dados:
        - Tipo: ${type}
        - Transação: ${transaction}
        - Localização: ${neighborhood}, ${city}
        - Quartos: ${bedrooms} (Sendo ${suites} suítes)
        - Vagas de Garagem: ${garage}
        - Valor: R$ ${price}
        - Características extras: ${features}

        Regras:
        1. Crie um título chamativo na primeira linha.
        2. Escreva no máximo 3 parágrafos curtos e envolventes.
        3. Destaque os benefícios de morar ou investir neste imóvel.
        4. Não use hashtags e seja elegante.
      `;

      // Chamada nativa à API da OpenAI (sem precisar instalar bibliotecas extras)
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
        },
        body: JSON.stringify({
          model: 'gpt-3.5-turbo', // ou gpt-4 se preferir
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.7
        })
      });

      const data = await response.json();

      if (data.error) {
        throw new Error(data.error.message);
      }

      const generatedText = data.choices[0].message.content;

      return res.json({ description: generatedText });
    } catch (error: any) {
      console.error('Erro na IA:', error);
      return res.status(500).json({ error: 'Erro ao gerar descrição com IA. Verifique a sua chave de API.' });
    }
  }
}