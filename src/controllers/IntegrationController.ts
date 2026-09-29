import { Request, Response } from 'express';

export class IntegrationController {
  
  // Buscar CEP na BrasilAPI
  async getCep(req: Request, res: Response): Promise<any> {
    try {
      const cep = req.params.cep as string; // Correção aqui
      const cleanCep = cep.replace(/\D/g, ''); 

      const response = await fetch(`https://brasilapi.com.br/api/cep/v1/${cleanCep}`);
      
      if (!response.ok) {
        return res.status(404).json({ error: 'CEP não encontrado' });
      }

      const data = await response.json();
      return res.json(data);
    } catch (error) {
      return res.status(500).json({ error: 'Erro ao consultar o CEP' });
    }
  }

  // Buscar CNPJ na BrasilAPI
  async getCnpj(req: Request, res: Response): Promise<any> {
    try {
      const cnpj = req.params.cnpj as string; // Correção aqui
      const cleanCnpj = cnpj.replace(/\D/g, '');

      const response = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cleanCnpj}`);
      
      if (!response.ok) {
        return res.status(404).json({ error: 'CNPJ não encontrado ou inválido' });
      }

      const data = await response.json();
      return res.json({
        razao_social: data.razao_social,
        nome_fantasia: data.nome_fantasia || data.razao_social,
        cep: data.cep,
        endereco: `${data.logradouro}, ${data.numero} - ${data.bairro}, ${data.municipio} - ${data.uf}`,
        telefone: data.ddd_telefone_1
      });
    } catch (error) {
      return res.status(500).json({ error: 'Erro ao consultar o CNPJ' });
    }
  }
}