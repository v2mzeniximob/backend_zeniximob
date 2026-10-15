import axios from 'axios';

export class FocusNfeService {
  private static getApiUrl(env: string) {
    // Homologação vs Produção da Focus NFe
    return env === 'producao' 
      ? 'https://api.focusnfe.com.br/v2' 
      : 'https://homologacao.focusnfe.com.br/v2';
  }

  // Emite Nota Fiscal de Serviço (NFS-e)
  static async emitNfse(storeConfig: { token: string; env: string; }, invoiceData: any, nfsePayload: { data_emissao: string; prestador: { cnpj: any; inscricao_municipal: any; }; tomador: { razao_social: any; email: any; cnpj: any; } | { razao_social: any; email: any; cpf: any; }; servico: { aliquota: number; discriminacao: any; iss_retido: string; item_lista_servico: any; valor_servicos: number; }; }) {
    const baseUrl = this.getApiUrl(storeConfig.env);
    
    // Autenticação Basic Auth (Token da empresa no usuário, senha vazia)
    const authHeader = `Basic ${Buffer.from(storeConfig.token + ':').toString('base64')} `;

    try {
      const response = await axios.post(`${baseUrl}/nfse`, invoiceData, {
        headers: {
          'Authorization': authHeader,
          'Content-Type': 'application/json'
        }
      });
      return response.data;
    } catch (error: any) {
      console.error('[FocusNfe] Erro ao emitir NFS-e:', error.response?.data || error.message);
      throw new Error(error.response?.data?.mensagem || 'Erro ao comunicar com a API da Focus NFe.');
    }
  }
}