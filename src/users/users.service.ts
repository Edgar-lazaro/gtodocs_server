import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(private readonly prisma: PrismaService) {}

  async list(params: { gerenciaId?: number }) {
    const where = params.gerenciaId ? { gerenciaId: params.gerenciaId } : {};

    const rows = await this.prisma.user.findMany({
      where,
      select: { id: true, username: true, nombre: true, apellido: true },
      orderBy: [{ nombre: 'asc' }, { apellido: 'asc' }],
    });

    const appUsers = rows.map((r) => ({
      id: r.id,
      username: r.username ?? '',
      nombre: [r.nombre, r.apellido].filter(Boolean).join(' '),
    }));

    // Enriquecer con usuarios de GLPI que aún no tienen cuenta en la app
    try {
      const glpiUsers = await this.fetchGlpiUsers();
      const appUsernames = new Set(rows.map((r) => (r.username ?? '').toLowerCase()));

      const glpiOnly = glpiUsers
        .filter((u) => u.name && !appUsernames.has(String(u.name).toLowerCase()))
        .map((u) => {
          const firstname = String(u.firstname ?? '').trim();
          const realname = String(u.realname ?? '').trim();
          const fullName = [firstname, realname].filter(Boolean).join(' ') || String(u.name);
          return {
            id: String(u.name),       // El username de GLPI como ID
            username: String(u.name),
            nombre: fullName,
          };
        });

      const merged = [...appUsers, ...glpiOnly].sort((a, b) =>
        a.nombre.toLowerCase().localeCompare(b.nombre.toLowerCase()),
      );
      return merged;
    } catch (err) {
      this.logger.warn(`No se pudieron cargar usuarios GLPI: ${err instanceof Error ? err.message : String(err)}`);
      return appUsers;
    }
  }

  private async fetchGlpiUsers(): Promise<any[]> {
    const glpiBase = (process.env.GLPI_URL ?? '').replace(/\/$/, '') + '/apirest.php';
    const appToken = process.env.GLPI_APP_TOKEN;
    const userToken = process.env.GLPI_USER_TOKEN;
    if (!appToken || !userToken) return [];

    const sessionResp = await axios.get(`${glpiBase}/initSession`, {
      headers: { 'App-Token': appToken, 'Authorization': `user_token ${userToken}` },
      timeout: 8000,
    });
    const sessionToken: string = sessionResp.data?.session_token;
    if (!sessionToken) return [];

    const headers = { 'App-Token': appToken, 'Session-Token': sessionToken };
    try {
      const resp = await axios.get(`${glpiBase}/User`, {
        headers,
        params: { range: '0-999', sort: 'name', order: 'ASC', 'is_deleted': 0 },
        timeout: 12000,
      });
      return Array.isArray(resp.data) ? resp.data : [];
    } finally {
      await axios.get(`${glpiBase}/killSession`, { headers, timeout: 4000 }).catch(() => {});
    }
  }
}
