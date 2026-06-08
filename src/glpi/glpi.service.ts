import axios, { AxiosInstance, AxiosResponse } from 'axios';
import { Injectable, ServiceUnavailableException } from '@nestjs/common';

type GlpiInitSessionResponse = {
  session_token?: string;
};

type GlpiListUserResponse = Array<{
  id?: number | string;
  name?: string;
  realname?: string;
}>;

@Injectable()
export class GlpiService {
  private baseUrl = (process.env.GLPI_URL ?? '').trim();
  private bearerToken = (process.env.GLPI_TOKEN ?? '').trim();
  private appToken = (process.env.GLPI_APP_TOKEN ?? '').trim();
  private userToken = (process.env.GLPI_USER_TOKEN ?? '').trim();

  private client: AxiosInstance | null = null;

  private getApiRoot() {
    const trimmed = (this.baseUrl ?? '').trim().replace(/\/+$/, '');
    if (!trimmed) return '';
    if (trimmed.endsWith('/apirest.php')) return trimmed;
    return `${trimmed}/apirest.php`;
  }

  private getClient() {
    if (this.client) return this.client;
    this.client = axios.create({
      baseURL: this.getApiRoot(),
      timeout: Number(process.env.GLPI_TIMEOUT_MS ?? 10000),
      headers: {
        'Content-Type': 'application/json',
      },
    });
    return this.client;
  }

  private isBearerMode() {
    return Boolean(this.bearerToken);
  }

  private assertConfigured() {
    if (!this.baseUrl) {
      throw new ServiceUnavailableException(
        'GLPI no configurado (define GLPI_URL en variables de entorno)',
      );
    }

    if (this.isBearerMode()) return;

    if (!this.appToken || !this.userToken) {
      throw new ServiceUnavailableException(
        'GLPI no configurado (define GLPI_APP_TOKEN y GLPI_USER_TOKEN; o alternativamente GLPI_TOKEN para modo Bearer)',
      );
    }
  }

  private async initSession(): Promise<string> {
    const client = this.getClient();
    const resp: AxiosResponse<GlpiInitSessionResponse> = await client.get(
      '/initSession',
      {
        headers: {
          'App-Token': this.appToken,
          Authorization: `user_token ${this.userToken}`,
        },
      },
    );

    const sessionToken = resp.data?.session_token;
    if (!sessionToken) {
      throw new ServiceUnavailableException(
        'GLPI: no se pudo iniciar sesión (respuesta sin session_token)',
      );
    }
    return sessionToken;
  }

  private async killSession(sessionToken: string): Promise<void> {
    const client = this.getClient();
    try {
      await client.get('/killSession', {
        headers: {
          'App-Token': this.appToken,
          'Session-Token': sessionToken,
        },
      });
    } catch {
      // best-effort
    }
  }

  async crearTicket(data: any) {
    this.assertConfigured();

    // Backward compatible mode (if GLPI is behind a gateway that accepts Bearer)
    if (this.isBearerMode()) {
      return axios.post(`${this.getApiRoot()}/Ticket`, data, {
        timeout: Number(process.env.GLPI_TIMEOUT_MS ?? 10000),
        headers: {
          Authorization: `Bearer ${this.bearerToken}`,
          'Content-Type': 'application/json',
        },
      });
    }

    // Standard GLPI REST API mode: initSession -> call -> killSession
    const sessionToken = await this.initSession();
    try {
      const client = this.getClient();
      return await client.post('/Ticket', data, {
        headers: {
          'App-Token': this.appToken,
          'Session-Token': sessionToken,
        },
      });
    } finally {
      await this.killSession(sessionToken);
    }
  }

  async listUsers(): Promise<GlpiListUserResponse> {
    this.assertConfigured();

    const sessionToken = await this.initSession();
    try {
      const client = this.getClient();
      const response = await client.get('/User', {
        headers: {
          'App-Token': this.appToken,
          'Session-Token': sessionToken,
        },
        params: {
          range: '0-100',
        },
      });

      return Array.isArray(response.data) ? response.data : [];
    } finally {
      await this.killSession(sessionToken);
    }
  }
}
