import axios from 'axios';

export class ContaAzulService {
  private static AUTH_URL = 'https://api.contaazul.com/oauth/authorize';
  private static TOKEN_URL = 'https://api.contaazul.com/oauth/token';
  private static API_BASE = 'https://api.contaazul.com/v1';

  // Solicitar novo token usando o Refresh Token
  static async refreshToken(config: { clientId: string; clientSecret: string; refreshToken: string }) {
    try {
      const authHeader = Buffer.from(`${config.clientId}:${config.clientSecret}`).toString('base64');
      const response = await axios.post(
        this.TOKEN_URL,
        new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: config.refreshToken
        }),
        {
          headers: {
            Authorization: `Basic ${authHeader}`,
            'Content-Type': 'application/x-www-form-urlencoded'
          }
        }
      );
      return response.data;
    } catch (error: any) {
      console.error('[ContaAzul] Erro ao renovar token:', error.response?.data || error.message);
      throw new Error('Falha na autenticação OAuth com a Conta Azul.');
    }
  }

  // Emitir Boleto / Cobrança Digital via Conta Azul
  static async createBoleto(accessToken: string, chargeData: any) {
    try {
      const response = await axios.post(`${this.API_BASE}/financial/charges`, chargeData, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      });
      return response.data;
    } catch (error: any) {
      console.error('[ContaAzul] Erro ao emitir boleto:', error.response?.data || error.message);
      throw new Error(error.response?.data?.message || 'Erro ao emitir boleto na Conta Azul.');
    }
  }
}