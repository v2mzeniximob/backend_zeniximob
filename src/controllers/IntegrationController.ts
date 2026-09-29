import { Request, Response } from 'express';

export class IntegrationController {
  // Consulta de CEP
  async getCep(req: Request, res: Response) {
    try {
      const { cep } = req.params;
      const cleanCep = (Array.isArray(cep) ? cep[0] : cep).replace(/\D/g, '');

      if (cleanCep.length !== 8) {
        return res.status(400).json({ error: 'CEP inválido.' });
      }

      const response = await fetch(`https://brasilapi.com.br/api/cep/v1/${cleanCep}`);
      if (!response.ok) {
        return res.status(404).json({ error: 'CEP não encontrado.' });
      }

      const data = await response.json();
      return res.json({
        street: data.street || '',
        neighborhood: data.neighborhood || '',
        city: data.city || '',
        state: data.state || ''
      });
    } catch (error) {
      return res.status(500).json({ error: 'Erro ao consultar CEP.' });
    }
  }

  // Consulta de CNPJ
  async getCnpj(req: Request, res: Response) {
    try {
      const { cnpj } = req.params;
      const cleanCnpj = (Array.isArray(cnpj) ? cnpj[0] : cnpj).replace(/\D/g, '');

      if (cleanCnpj.length !== 14) {
        return res.status(400).json({ error: 'CNPJ inválido.' });
      }

      // Consulta à BrasilAPI para dados de CNPJ
      const response = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cleanCnpj}`);
      
      if (!response.ok) {
        return res.status(404).json({ error: 'CNPJ não encontrado na base de dados.' });
      }

      const data = await response.json();
      
      // Normaliza os dados para corresponder ao formato que o frontend espera
      const formattedData = {
        razao_social: data.razao_social || '',
        nome_fantasia: data.nome_fantasia || data.razao_social || '',
        cep: data.cep ? data.cep.replace(/\D/g, '') : '',
        endereco: `${data.logradouro || ''}, ${data.numero || ''} - ${data.bairro || ''}, ${data.municipio || ''} - ${data.uf || ''}`,
        telefone: data.ddd_telefone_1 ? `(${data.ddd_telefone_1.slice(0, 2)}) ${data.ddd_telefone_1.slice(2)}` : ''
      };

      return res.json(formattedData);
    } catch (error) {
      console.error('Erro na integração de CNPJ:', error);
      return res.status(500).json({ error: 'Erro ao consultar CNPJ.' });
    }
  }
}