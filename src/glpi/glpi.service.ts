import axios from 'axios';
import { ServiceUnavailableException } from '@nestjs/common';

export class GlpiService {
  private baseUrl = (process.env.GLPI_URL ?? '').trim();
  private token = (process.env.GLPI_TOKEN ?? '').trim();

  async crearTicket(data: any) {
    if (!this.baseUrl || !this.token) {
      throw new ServiceUnavailableException(
        'GLPI no configurado (define GLPI_URL y GLPI_TOKEN en variables de entorno)',
      );
    }

    return axios.post(`${this.baseUrl}/apirest.php/Ticket`, data, {
      headers: {
        Authorization: `Bearer ${this.token}`,
        'Content-Type': 'application/json',
      },
    });
  }
}
