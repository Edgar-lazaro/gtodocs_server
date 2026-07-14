import axios, { AxiosInstance, AxiosResponse } from 'axios';
import { Injectable, ServiceUnavailableException, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

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
  private readonly logger = new Logger(GlpiService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ─── Helpers ─────────────────────────────────────────────────────────────

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
      headers: { 'Content-Type': 'application/json' },
    });
    return this.client;
  }

  private isBearerMode() {
    return Boolean(this.bearerToken);
  }

  private assertConfigured() {
    if (!this.baseUrl) {
      throw new ServiceUnavailableException('GLPI no configurado (define GLPI_URL)');
    }
    if (this.isBearerMode()) return;
    if (!this.appToken || !this.userToken) {
      throw new ServiceUnavailableException('GLPI no configurado (define GLPI_APP_TOKEN y GLPI_USER_TOKEN)');
    }
  }

  /** Detecta respuestas de error de GLPI y las convierte en excepciones con mensaje útil */
  private checkGlpiResponse(data: unknown, label: string) {
    if (Array.isArray(data) && typeof data[0] === 'string' && (data[0] as string).startsWith('ERROR')) {
      const msg = (data[1] as string) ?? (data[0] as string);
      this.logger.error(`GLPI ${label} error: ${msg}`);
      throw new BadRequestException(`GLPI: ${msg}`);
    }
  }

  /** Envuelve una llamada axios: propaga errores GLPI con mensaje útil */
  private async callGlpi<T = any>(label: string, fn: () => Promise<AxiosResponse<T>>): Promise<T> {
    try {
      this.logger.log(`GLPI -> ${label}`);
      const res = await fn();
      this.checkGlpiResponse(res.data, label);
      this.logger.log(`GLPI <- ${label} OK`);
      return res.data;
    } catch (err: any) {
      if (err instanceof BadRequestException) throw err;
      // Axios error: the response body might be a GLPI error array
      const glpiData = err?.response?.data;
      if (Array.isArray(glpiData) && typeof glpiData[0] === 'string') {
        const msg = (glpiData[1] as string) ?? (glpiData[0] as string);
        this.logger.error(`GLPI ${label} HTTP ${err?.response?.status}: ${msg}`);
        throw new BadRequestException(`GLPI: ${msg}`);
      }
      const msg = err?.message ?? String(err);
      this.logger.error(`GLPI ${label} failed: ${msg}`);
      throw new BadRequestException(`GLPI: ${msg}`);
    }
  }

  // ─── Session ──────────────────────────────────────────────────────────────

  private async initSession(): Promise<string> {
    const client = this.getClient();
    const resp: AxiosResponse<GlpiInitSessionResponse> = await client.get('/initSession', {
      headers: {
        'App-Token': this.appToken,
        Authorization: `user_token ${this.userToken}`,
      },
    });
    const sessionToken = resp.data?.session_token;
    if (!sessionToken) {
      throw new ServiceUnavailableException('GLPI: no se pudo iniciar sesión');
    }
    return sessionToken;
  }

  private async killSession(sessionToken: string): Promise<void> {
    const client = this.getClient();
    try {
      await client.get('/killSession', {
        headers: { 'App-Token': this.appToken, 'Session-Token': sessionToken },
      });
    } catch { /* best-effort */ }
  }

  // ─── Tickets ──────────────────────────────────────────────────────────────

  async crearTicket(data: any) {
    this.assertConfigured();
    if (this.isBearerMode()) {
      return this.callGlpi('POST /Ticket', () =>
        axios.post(`${this.getApiRoot()}/Ticket`, data, {
          timeout: Number(process.env.GLPI_TIMEOUT_MS ?? 10000),
          headers: { Authorization: `Bearer ${this.bearerToken}`, 'Content-Type': 'application/json' },
        })
      );
    }
    const sessionToken = await this.initSession();
    try {
      return await this.callGlpi('POST /Ticket', () =>
        this.getClient().post('/Ticket', data, {
          headers: { 'App-Token': this.appToken, 'Session-Token': sessionToken },
        })
      );
    } finally { await this.killSession(sessionToken); }
  }

  async obtenerTickets(criteria?: Record<string, string>[]) {
    this.assertConfigured();

    // GET /Ticket (getItems) ignora silenciosamente el parámetro "criteria[]"
    // (solo /search/{itemtype} lo respeta). Con criteria, usamos /search para
    // obtener los IDs que de verdad cumplen el filtro y luego pedimos cada
    // ticket completo, para mantener la misma forma de respuesta de siempre.
    if (criteria?.length) {
      return this.buscarTicketsFiltrados(criteria);
    }

    const params: Record<string, unknown> = { range: '0-999', sort: 'date_mod', order: 'DESC' };
    if (this.isBearerMode()) {
      const resp = await axios.get(`${this.getApiRoot()}/Ticket`, {
        timeout: Number(process.env.GLPI_TIMEOUT_MS ?? 10000),
        headers: { Authorization: `Bearer ${this.bearerToken}` },
        params,
      });
      return Array.isArray(resp.data) ? resp.data : [];
    }
    const sessionToken = await this.initSession();
    try {
      const resp = await this.getClient().get('/Ticket', {
        headers: { 'App-Token': this.appToken, 'Session-Token': sessionToken },
        params,
      });
      return Array.isArray(resp.data) ? resp.data : [];
    } finally { await this.killSession(sessionToken); }
  }

  private async buscarTicketsFiltrados(criteria: Record<string, string>[]) {
    const searchParams: Record<string, unknown> = { range: '0-999' };
    criteria.forEach((c, i) => {
      Object.entries(c).forEach(([k, v]) => { searchParams[`criteria[${i}][${k}]`] = v; });
    });

    const fetchIds = async (headers: Record<string, string>, get: (url: string, cfg: any) => Promise<AxiosResponse>) => {
      const searchRes = await get('/search/Ticket', { headers, params: searchParams });
      const rows: any[] = Array.isArray(searchRes.data?.data) ? searchRes.data.data : [];
      // El campo "2" es el ID del ticket (search option estándar de GLPI).
      return [...new Set(rows.map((r) => Number(r['2'])).filter((id) => Number.isFinite(id) && id > 0))];
    };

    const fetchTickets = async (ids: number[], headers: Record<string, string>, get: (url: string, cfg: any) => Promise<AxiosResponse>) => {
      const tickets = await Promise.all(
        ids.map((id) => get(`/Ticket/${id}`, { headers }).then((r) => r.data).catch(() => null)),
      );
      return tickets
        .filter(Boolean)
        .sort((a: any, b: any) => new Date(b.date_mod ?? 0).getTime() - new Date(a.date_mod ?? 0).getTime());
    };

    if (this.isBearerMode()) {
      const headers = { Authorization: `Bearer ${this.bearerToken}` };
      const get = (url: string, cfg: any) => axios.get(`${this.getApiRoot()}${url}`, {
        timeout: Number(process.env.GLPI_TIMEOUT_MS ?? 10000), ...cfg, headers: { ...headers, ...cfg.headers },
      });
      const ids = await fetchIds(headers, get);
      if (!ids.length) return [];
      return fetchTickets(ids, headers, get);
    }

    const sessionToken = await this.initSession();
    try {
      const client = this.getClient();
      const headers = { 'App-Token': this.appToken, 'Session-Token': sessionToken };
      const get = (url: string, cfg: any) => client.get(url, cfg);
      const ids = await fetchIds(headers, get);
      if (!ids.length) return [];
      return fetchTickets(ids, headers, get);
    } finally { await this.killSession(sessionToken); }
  }

  async obtenerTicketPorId(ticketId: number) {
    this.assertConfigured();
    const sessionToken = await this.initSession();
    try {
      const resp = await this.getClient().get(`/Ticket/${ticketId}`, {
        headers: { 'App-Token': this.appToken, 'Session-Token': sessionToken },
      });
      return resp.data;
    } finally { await this.killSession(sessionToken); }
  }

  async cambiarStatusTicket(ticketId: number, status: number) {
    this.assertConfigured();
    const data = { input: { status } };
    const sessionToken = await this.initSession();
    try {
      return await this.callGlpi(`PUT /Ticket/${ticketId}`, () =>
        this.getClient().put(`/Ticket/${ticketId}`, data, {
          headers: { 'App-Token': this.appToken, 'Session-Token': sessionToken },
        })
      );
    } finally { await this.killSession(sessionToken); }
  }

  // ─── Followups ────────────────────────────────────────────────────────────

  async crearFollowup(
    ticketId: number,
    content: string,
    userId?: number,
    opts?: { is_private?: number; requesttypes_id?: number },
  ) {
    this.assertConfigured();
    const data = {
      input: {
        items_id: ticketId,
        itemtype: 'Ticket',
        content,
        ...(userId ? { users_id: userId } : {}),
        ...(opts?.is_private !== undefined ? { is_private: opts.is_private } : {}),
        ...(opts?.requesttypes_id ? { requesttypes_id: opts.requesttypes_id } : {}),
      },
    };
    const sessionToken = await this.initSession();
    try {
      const res = await this.callGlpi('POST /ITILFollowup', () =>
        this.getClient().post('/ITILFollowup', data, {
          headers: { 'App-Token': this.appToken, 'Session-Token': sessionToken },
        })
      );
      return { id: Number((res as any)?.id ?? 0) };
    } finally { await this.killSession(sessionToken); }
  }

  // ─── Tasks ────────────────────────────────────────────────────────────────

  async crearTask(ticketId: number, input: Record<string, unknown>) {
    this.assertConfigured();
    const data = { input: { ...input, tickets_id: ticketId } };
    const sessionToken = await this.initSession();
    try {
      return await this.callGlpi('POST /TicketTask', () =>
        this.getClient().post('/TicketTask', data, {
          headers: { 'App-Token': this.appToken, 'Session-Token': sessionToken },
        })
      );
    } finally { await this.killSession(sessionToken); }
  }

  // ─── Solution ─────────────────────────────────────────────────────────────

  async crearSolucionConTipo(
    ticketId: number,
    content: string,
    solutiontypes_id: number,
    _status: number,
    userId?: number,
  ) {
    this.assertConfigured();
    const data = {
      input: {
        items_id: ticketId,
        itemtype: 'Ticket',
        content,
        solutiontypes_id,
        ...(userId ? { users_id: userId } : {}),
      },
    };
    const sessionToken = await this.initSession();
    try {
      const client = this.getClient();
      const headers = { 'App-Token': this.appToken, 'Session-Token': sessionToken };

      // 1. Crear la solución
      const solutionRes = await this.callGlpi('POST /ITILSolution', () =>
        client.post('/ITILSolution', data, { headers })
      );
      const solutionId = Number((solutionRes as any)?.id ?? 0);

      // 2. Crear TicketValidation automática para el/los solicitante(s) real(es) del ticket
      // (Ticket_User type=1 = Requester; users_id_recipient es solo quien registró el ticket
      // en GLPI y puede ser un técnico distinto del solicitante real).
      try {
        const ticketUserRes = await client.get(`/Ticket/${ticketId}/Ticket_User`, { headers });
        const ticketUsers: any[] = Array.isArray(ticketUserRes.data) ? ticketUserRes.data : [];
        let requesterIds = [...new Set(
          ticketUsers.filter((u) => Number(u.type) === 1).map((u) => Number(u.users_id)),
        )];

        if (requesterIds.length === 0) {
          // Fallback si no hay relación Ticket_User (no debería ocurrir en GLPI normal)
          const ticketRes = await client.get('/Ticket/' + ticketId, { headers });
          const fallbackId: number | null = ticketRes.data?.users_id_recipient ?? null;
          if (fallbackId) requesterIds = [Number(fallbackId)];
        }

        for (const requesterId of requesterIds) {
          await client.post('/TicketValidation', {
            input: {
              tickets_id: ticketId,
              users_id_validate: requesterId,
              comment_submission: 'Solución pendiente de aprobación.',
            },
          }, { headers });
          this.logger.log('TicketValidation creada para usuario ' + requesterId);
        }
      } catch (e: any) {
        this.logger.warn('No se pudo crear TicketValidation automática: ' + (e as any)?.message);
      }

      return { id: solutionId };
    } finally { await this.killSession(sessionToken); }
  }

  // Alias sin tipo (mantiene compatibilidad)
  async crearSolucion(ticketId: number, content: string, _status: number, userId?: number) {
    return this.crearSolucionConTipo(ticketId, content, 1, _status, userId);
  }

  async aprobarSolucion(solutionId: number, approved: boolean) {
    this.assertConfigured();
    const sessionToken = await this.initSession();
    try {
      const client = this.getClient();
      const headers = { 'App-Token': this.appToken, 'Session-Token': sessionToken };

      // 1. Get solution details to obtain ticketId
      const getRes = await client.get(`/ITILSolution/${solutionId}`, { headers });
      const ticketId = getRes.data?.items_id;
      this.logger.log(`aprobarSolucion id=${solutionId} ticketId=${ticketId} approved=${approved}`);

      // 2. Update solution status: ACCEPTED=3, REFUSED=4 (CommonITILValidation constants)
      const solutionStatus = approved ? 3 : 4;
      await client.put(`/ITILSolution/${solutionId}`,
        { input: { status: solutionStatus } },
        { headers },
      );
      this.logger.log(`aprobarSolucion solution status set to ${solutionStatus}`);

      // 3. Update ticket status: CLOSED=6 (approved), IN_PROGRESS=2 (refused)
      if (ticketId) {
        const ticketStatus = approved ? 6 : 2;
        await client.put(`/Ticket/${ticketId}`,
          { input: { status: ticketStatus } },
          { headers },
        );
        this.logger.log(`aprobarSolucion ticket ${ticketId} status set to ${ticketStatus}`);
      }

      return { success: true, solutionId, approved };
    } finally { await this.killSession(sessionToken); }
  }


  async aprobarValidacion(validationId: number, approved: boolean) {
    this.assertConfigured();
    const sessionToken = await this.initSession();
    try {
      const client = this.getClient();
      const headers = { 'App-Token': this.appToken, 'Session-Token': sessionToken };

      const valRes = await client.get(`/TicketValidation/${validationId}`, { headers });
      const ticketId = valRes.data?.tickets_id;
      this.logger.log(`aprobarValidacion id=${validationId} ticketId=${ticketId} approved=${approved}`);

      const valStatus = approved ? 3 : 4;
      // GLPI requiere comment_validation al rechazar (status=4)
      const valInput: any = { status: valStatus };
      if (!approved) valInput.comment_validation = 'Solución rechazada.';
      // Intento best-effort: GLPI 11 bloquea por diseño que un usuario distinto
      // al validador objetivo cambie este status (ver glpi-project/glpi#19206),
      // así que esto normalmente no persiste cuando llamamos con la cuenta de
      // servicio compartida. La decisión real se guarda abajo en nuestra BD.
      await client.put(`/TicketValidation/${validationId}`,
        { input: valInput },
        { headers },
      ).catch((e: any) => this.logger.warn('TicketValidation update (best-effort): ' + JSON.stringify(e?.response?.data ?? e?.message)));

      let solutionId: number | null = null;
      if (ticketId) {
        try {
          const solRes = await client.get(`/Ticket/${ticketId}/ITILSolution`, { headers });
          const solutions = Array.isArray(solRes.data) ? solRes.data : [];
          if (solutions.length > 0) {
            const lastSol = solutions[solutions.length - 1];
            solutionId = Number(lastSol.id);
            const solStatus = approved ? 3 : 4;
            await client.put(`/ITILSolution/${lastSol.id}`,
              { input: { status: solStatus } },
              { headers },
            ).catch((e: any) => this.logger.warn('ITILSolution update failed: ' + JSON.stringify(e?.response?.data ?? e?.message)));
          }
        } catch (e) {
          this.logger.warn('No se pudo leer ITILSolution: ' + (e as any)?.message);
        }
        const ticketStatus = approved ? 6 : 2;
        await client.put(`/Ticket/${ticketId}`,
          { input: { status: ticketStatus } },
          { headers },
        ).catch((e: any) => this.logger.warn('Ticket status update failed: ' + JSON.stringify(e?.response?.data ?? e?.message)));
      }

      // Fuente de verdad para la UI: nuestra propia BD (ver comentario arriba).
      await this.prisma.glpi_validacion_decisiones.upsert({
        where: { validationId },
        create: { validationId, ticketId: Number(ticketId ?? 0), solutionId, approved },
        update: { approved, solutionId },
      });

      return { success: true, validationId, approved };
    } finally { await this.killSession(sessionToken); }
  }

  // ─── Documents ────────────────────────────────────────────────────────────

  async subirDocumento(ticketId: number, fileName: string, fileBuffer: Buffer, mimeType: string, userId?: number, followupId?: number, solutionId?: number) {
    this.assertConfigured();

    if (!fileBuffer || fileBuffer.length === 0) {
      throw new BadRequestException('El archivo está vacío o no se recibió correctamente');
    }

    this.logger.log(`subirDocumento ticket=${ticketId} file=${fileName} followupId=${followupId ?? "none"}`);

    // GLPI REST API: el field name del multipart DEBE coincidir con el valor en _filename.
    // Usamos un nombre seguro sin corchetes para que PHP no lo convierta en array
    // (filename[0] → $_FILES['filename'][0] en lugar de $_FILES['filename[0]']).
    const glpiFieldName = 'uploadfile';
    const FormData = require('form-data');
    const formData = new FormData();
    formData.append(
      'uploadManifest',
      JSON.stringify({
        input: {
          name: fileName,
          _filename: [glpiFieldName],
          ...(userId ? { users_id: userId } : {}),
        },
      }),
    );
    formData.append(glpiFieldName, fileBuffer, {
      filename: fileName,
      contentType: mimeType,
      knownLength: fileBuffer.length,
    });

    const sessionToken = await this.initSession();
    try {
      const client = this.getClient();
      const formHeaders: Record<string, string> = {
        ...(formData.getHeaders ? formData.getHeaders() : {}),
        'App-Token': this.appToken,
        'Session-Token': sessionToken,
      };

      // 1. Upload the document file to GLPI
      let docId: number | null = null;
      try {
        const docRes = await client.post('/Document', formData, {
          headers: formHeaders,
          timeout: 60000,
          maxBodyLength: Infinity,
          maxContentLength: Infinity,
        });
        this.checkGlpiResponse(docRes.data, 'POST /Document');
        docId = (docRes.data as any)?.id ?? null;
        this.logger.log(`Document created id=${docId}`);
      } catch (err: any) {
        const glpiData = err?.response?.data;
        if (Array.isArray(glpiData)) {
          throw new BadRequestException(`GLPI document upload: ${glpiData[1] ?? glpiData[0]}`);
        }
        throw err;
      }

      if (!docId) {
        throw new BadRequestException('GLPI no devolvió un ID de documento');
      }

      const jsonHeaders = {
        'App-Token': this.appToken,
        'Session-Token': sessionToken,
        'Content-Type': 'application/json',
      };

      // 2. Correct users_id — GLPI ignores it in multipart manifest
      if (userId) {
        try {
          await client.put(
            '/Document/' + String(docId),
            { input: { users_id: userId } },
            { headers: jsonHeaders },
          );
        } catch { /* non-critical */ }
      }

      // 3. Link the document to the ticket (skip when linked to followup/solution)
      if (!followupId && !solutionId) {
      try {
        await client.post(
          '/Document_Item',
          { input: { documents_id: docId, itemtype: 'Ticket', items_id: ticketId } },
          { headers: jsonHeaders },
        );
        this.logger.log(`Document ${docId} linked to ticket ${ticketId}`);
      } catch (err: any) {
        const glpiData = err?.response?.data;
        const msg = Array.isArray(glpiData)
          ? (glpiData[1] ?? glpiData[0])
          : (err?.message ?? 'Error linking document');
        this.logger.error(`Document_Item link failed: ${msg}`);
        throw new BadRequestException(`GLPI: Error al vincular documento al ticket: ${msg}`);
      }
      }
      // 4. Also link to the followup if provided (for proper grouping)
      if (followupId && docId) {
        try {
          await client.post(
            '/Document_Item',
            { input: { documents_id: docId, itemtype: 'ITILFollowup', items_id: followupId } },
            { headers: jsonHeaders },
          );
        } catch { /* non-critical */ }
      }

      // 5. Also link to the solution if provided (for proper grouping)
      if (solutionId && docId) {
        try {
          await client.post(
            '/Document_Item',
            { input: { documents_id: docId, itemtype: 'ITILSolution', items_id: solutionId } },
            { headers: jsonHeaders },
          );
        } catch { /* non-critical */ }
      }

      return { id: docId, followupId: followupId ?? null, solutionId: solutionId ?? null, message: `Documento '${fileName}' adjuntado exitosamente` };
    } finally {
      await this.killSession(sessionToken);
    }
  }

  // ─── Validation ───────────────────────────────────────────────────────────

  async solicitarValidacion(ticketId: number, userId: number, comment: string) {
    this.assertConfigured();
    const data = {
      input: {
        tickets_id: ticketId,
        users_id_validate: userId,
        comment_submission: comment,
      },
    };
    const sessionToken = await this.initSession();
    try {
      return await this.callGlpi('POST /TicketValidation', () =>
        this.getClient().post('/TicketValidation', data, {
          headers: { 'App-Token': this.appToken, 'Session-Token': sessionToken },
        })
      );
    } finally { await this.killSession(sessionToken); }
  }

  // ─── Timeline ─────────────────────────────────────────────────────────────

  async obtenerTimeline(ticketId: number) {
    this.assertConfigured();
    const sessionToken = await this.initSession();
    try {
      const client = this.getClient();
      const headers = { 'App-Token': this.appToken, 'Session-Token': sessionToken };
      const results = await Promise.allSettled([
        client.get(`/Ticket/${ticketId}/ITILFollowup`, { headers }),
        client.get(`/Ticket/${ticketId}/TicketTask`, { headers }),
        client.get(`/Ticket/${ticketId}/ITILSolution`, { headers }),
        client.get(`/Ticket/${ticketId}/TicketValidation`, { headers }),
        client.get('/User', { headers, params: { range: '0-500', recursive: true } }),
      ]);

      const extractData = (r: PromiseSettledResult<unknown>) =>
        r.status === 'fulfilled' && Array.isArray((r.value as any)?.data)
          ? (r.value as any).data
          : [];

      const followups = extractData(results[0]);
      const tasks = extractData(results[1]);
      const solutions = extractData(results[2]);
      const validations = extractData(results[3]);
      const users = extractData(results[4]);

      const buildName = (u: any) => {
        const full = [u.firstname ?? '', u.realname ?? ''].filter(Boolean).join(' ').trim();
        return full || u.name || null;
      };

      const userMap = new Map<number, string>();
      for (const u of users) {
        userMap.set(Number(u.id), buildName(u) ?? `Usuario #${u.id}`);
      }

      // Fetch individually any user IDs not returned by the bulk list
      const allIds = new Set([
        ...followups.map((x: any) => Number(x.users_id)),
        ...tasks.map((x: any) => Number(x.users_id)),
        ...solutions.map((x: any) => Number(x.users_id)),
        ...validations.map((x: any) => Number(x.users_id)),
      ].filter(Boolean));
      const missingIds = [...allIds].filter((id) => !userMap.has(id));
      if (missingIds.length > 0) {
        await Promise.all(missingIds.map(async (uid) => {
          try {
            const r = await client.get(`/User/${uid}`, { headers });
            const name = buildName(r.data);
            if (name) userMap.set(uid, name);
          } catch { /* user not accessible */ }
        }));
      }

      const items: any[] = [];
      // Fetch linked doc IDs per followup (for client-side grouping)
      const followupDocMap = new Map<number, number[]>();
      if (followups.length > 0) {
        await Promise.all(followups.map(async (f: any) => {
          try {
            const r = await client.get('/ITILFollowup/' + f.id + '/Document_Item', { headers });
            const items2: any[] = Array.isArray(r.data) ? r.data : [];
            followupDocMap.set(Number(f.id), items2.map((i: any) => Number(i.documents_id)).filter(Boolean));
          } catch { followupDocMap.set(Number(f.id), []); }
        }));
      }

      for (const f of followups) {
        items.push({
          tipo: 'followup',
          id: f.id,
          contenido: f.content ?? '',
          usuarioId: f.users_id,
          usuarioNombre: userMap.get(Number(f.users_id)) ?? null,
          fecha: f.date_creation ?? '',
          esPrivado: f.is_private === 1,
          docIds: followupDocMap.get(Number(f.id)) ?? [],
        });
      }
      for (const t of tasks) {
        items.push({
          tipo: 'task',
          id: t.id,
          contenido: t.content ?? '',
          usuarioId: t.users_id,
          usuarioNombre: userMap.get(Number(t.users_id)) ?? null,
          fecha: t.date_creation ?? '',
          estado: t.state,
        });
      }
      // Fetch linked doc IDs per solution
      const solutionDocMap = new Map<number, number[]>();
      if (solutions.length > 0) {
        await Promise.all(solutions.map(async (s: any) => {
          try {
            const r = await client.get('/ITILSolution/' + s.id + '/Document_Item', { headers });
            const items2: any[] = Array.isArray(r.data) ? r.data : [];
            solutionDocMap.set(Number(s.id), items2.map((i: any) => Number(i.documents_id)).filter(Boolean));
          } catch { solutionDocMap.set(Number(s.id), []); }
        }));
      }

      for (const s of solutions) {
        items.push({
          tipo: 'solution',
          id: s.id,
          contenido: s.content ?? '',
          usuarioId: s.users_id,
          usuarioNombre: userMap.get(Number(s.users_id)) ?? null,
          fecha: s.date_creation ?? '',
          estado: s.status,
          docIds: solutionDocMap.get(Number(s.id)) ?? [],
        });
      }
      // GLPI 11 bloquea que la cuenta de servicio cambie el status de una
      // validación ajena (glpi-project/glpi#19206), así que el status real
      // de aprobado/rechazado vive en nuestra propia BD, no en GLPI.
      const decisiones = validations.length
        ? await this.prisma.glpi_validacion_decisiones.findMany({
            where: { validationId: { in: validations.map((v: any) => Number(v.id)) } },
          })
        : [];
      const decisionMap = new Map(decisiones.map((d) => [d.validationId, d.approved]));

      for (const v of validations) {
        const decision = decisionMap.get(Number(v.id));
        items.push({
          tipo: 'validation',
          id: v.id,
          contenido: v.comment_submission ?? '',
          usuarioId: v.users_id,
          usuarioNombre: userMap.get(Number(v.users_id)) ?? null,
          fecha: v.submission_date ?? '',
          estado: decision === undefined ? v.status : (decision ? 3 : 4),
          // GLPI 11+ ya no llena users_id_validate (queda en 0); el validador real
          // vive en items_id_target/itemtype_target (soporta User o Group).
          usuarioValidacion: v.itemtype_target === 'User'
            ? Number(v.items_id_target)
            : Number(v.users_id_validate) || null,
        });
      }

      items.sort((a, b) => new Date(a.fecha).getTime() - new Date(b.fecha).getTime());
      return items;
    } finally {
      await this.killSession(sessionToken);
    }
  }

  // ─── Users ────────────────────────────────────────────────────────────────

  // El listado de usuarios cambia poco (altas/bajas ocasionales) pero se
  // pedía completo por sesión GLPI nueva en CADA creación de ticket,
  // seguimiento y solución (via findGlpiUserIdByUsername). Con 150-250
  // usuarios concurrentes eso multiplicaba la carga sobre GLPI varias
  // veces por acción. Cache en memoria con TTL + single-flight: si el
  // cache expira justo cuando llega una ráfaga, solo se dispara UNA
  // llamada real a GLPI y todas las esperan esa misma promesa.
  private usersCache: { data: GlpiListUserResponse; expiresAt: number } | null = null;
  private usersCacheInFlight: Promise<GlpiListUserResponse> | null = null;

  async listUsers(): Promise<GlpiListUserResponse> {
    const now = Date.now();
    if (this.usersCache && this.usersCache.expiresAt > now) {
      return this.usersCache.data;
    }
    if (this.usersCacheInFlight) {
      return this.usersCacheInFlight;
    }
    const ttlMs = Number(process.env.GLPI_USERS_CACHE_TTL_MS ?? 5 * 60_000);
    this.usersCacheInFlight = this.fetchUsersFromGlpi()
      .then((data) => {
        this.usersCache = { data, expiresAt: Date.now() + ttlMs };
        return data;
      })
      .finally(() => { this.usersCacheInFlight = null; });
    return this.usersCacheInFlight;
  }

  private async fetchUsersFromGlpi(): Promise<GlpiListUserResponse> {
    this.assertConfigured();
    const sessionToken = await this.initSession();
    try {
      const resp = await this.getClient().get('/User', {
        headers: { 'App-Token': this.appToken, 'Session-Token': sessionToken },
        params: { range: '0-500' },
      });
      return Array.isArray(resp.data) ? resp.data : [];
    } finally { await this.killSession(sessionToken); }
  }

  async listarUsuariosGlpi() {
    return this.listUsers();
  }

  async findGlpiUserIdByUsername(username: string): Promise<number | null> {
    const users = await this.listUsers();
    const lower = username.trim().toLowerCase();
    const found = users.find((u) => {
      const name = String(u?.name ?? '').trim().toLowerCase();
      const realname = String(u?.realname ?? '').trim().toLowerCase();
      return name === lower || realname === lower;
    });
    return found?.id != null ? Number(found.id) : null;
  }

  async obtenerFollowups(ticketId: number) {
    this.assertConfigured();
    const sessionToken = await this.initSession();
    try {
      const resp = await this.getClient().get(`/Ticket/${ticketId}/ITILFollowup`, {
        headers: { 'App-Token': this.appToken, 'Session-Token': sessionToken },
      });
      return Array.isArray(resp.data) ? resp.data : [];
    } finally { await this.killSession(sessionToken); }
  }

  // ─── Documents (nuevos endpoints) ─────────────────────────────────────────

  async listarDocumentosDeTicket(ticketId: number) {
    this.assertConfigured();
    const sessionToken = await this.initSession();
    try {
      const client = this.getClient();
      const headers = { 'App-Token': this.appToken, 'Session-Token': sessionToken };

      // Collect all document IDs: ticket-level + followup + solution docs
      const allDocIds = new Set<number>();

      // Ticket-level docs
      try {
        const itemsRes = await client.get(`/Ticket/${ticketId}/Document_Item`, { headers });
        const tItems: any[] = Array.isArray(itemsRes.data) ? itemsRes.data : [];
        for (const i of tItems) { if (i.documents_id) allDocIds.add(Number(i.documents_id)); }
      } catch { /* continue */ }

      // Followup docs
      try {
        const fuRes = await client.get(`/Ticket/${ticketId}/ITILFollowup`, { headers });
        const followups: any[] = Array.isArray(fuRes.data) ? fuRes.data : [];
        await Promise.all(followups.map(async (f: any) => {
          try {
            const diRes = await client.get(`/ITILFollowup/${f.id}/Document_Item`, { headers });
            const diItems: any[] = Array.isArray(diRes.data) ? diRes.data : [];
            for (const i of diItems) { if (i.documents_id) allDocIds.add(Number(i.documents_id)); }
          } catch { /* continue */ }
        }));
      } catch { /* continue */ }

      // Solution docs
      try {
        const solRes = await client.get(`/Ticket/${ticketId}/ITILSolution`, { headers });
        const solutions: any[] = Array.isArray(solRes.data) ? solRes.data : [];
        await Promise.all(solutions.map(async (s: any) => {
          try {
            const diRes = await client.get(`/ITILSolution/${s.id}/Document_Item`, { headers });
            const diItems: any[] = Array.isArray(diRes.data) ? diRes.data : [];
            for (const i of diItems) { if (i.documents_id) allDocIds.add(Number(i.documents_id)); }
          } catch { /* continue */ }
        }));
      } catch { /* continue */ }

      if (allDocIds.size === 0) return [];
      const items = [...allDocIds].map((id) => ({ documents_id: id }));

      // Fetch users non-critically — documents still load if this fails
      const userMap = new Map<number, string>();
      try {
        const usersRes = await client.get('/User', { headers, params: { range: '0-500', recursive: true } });
        const users: any[] = Array.isArray(usersRes.data) ? usersRes.data : [];
        for (const u of users) {
          const uid = Number(u.id);
          const full = [u.firstname ?? '', u.realname ?? ''].filter(Boolean).join(' ').trim();
          userMap.set(uid, full || u.name || `Usuario #${uid}`);
        }
      } catch { /* names will be null, documents still load */ }

      const docs = await Promise.all(
        items.map(async (item) => {
          const docId = item.documents_id;
          if (!docId) return null;
          try {
            const docRes = await client.get(`/Document/${docId}`, { headers });
            const d = docRes.data;
            if (d.is_deleted === 1) return null;
            const uid = Number(d.users_id);
            return {
              id: d.id,
              nombre: d.name ?? d.filename ?? '',
              filename: d.filename ?? '',
              mime: d.mime ?? 'application/octet-stream',
              size: d.filesize ?? 0,
              fecha: d.date_creation ?? '',
              usuarioId: d.users_id ?? null,
              usuarioNombre: userMap.get(uid) ?? null,
            };
          } catch { return null; }
        }),
      );

      return docs.filter(Boolean);
    } finally {
      await this.killSession(sessionToken);
    }
  }

  async descargarDocumentoBytes(docId: number): Promise<{ buffer: Buffer; contentType: string; filename: string }> {
    this.assertConfigured();
    const sessionToken = await this.initSession();
    try {
      const client = this.getClient();
      const headers = { 'App-Token': this.appToken, 'Session-Token': sessionToken };

      // Metadata para obtener mime y filename
      const metaRes = await client.get(`/Document/${docId}`, { headers });
      const meta = metaRes.data;
      const filename = meta.filename ?? `documento_${docId}`;
      const contentType = meta.mime ?? 'application/octet-stream';

      // Descargar bytes — GLPI devuelve el archivo con Accept: application/octet-stream
      const fileRes = await client.get(`/Document/${docId}`, {
        headers: { ...headers, Accept: 'application/octet-stream' },
        responseType: 'arraybuffer',
        timeout: 60000,
      });

      return { buffer: Buffer.from(fileRes.data as ArrayBuffer), contentType, filename };
    } finally {
      await this.killSession(sessionToken);
    }
  }

  async editarSeguimiento(followupId: number, content: string) {
    this.assertConfigured();
    const sessionToken = await this.initSession();
    try {
      return await this.callGlpi(`PUT /ITILFollowup/${followupId}`, () =>
        this.getClient().put(`/ITILFollowup/${followupId}`, { input: { content } }, {
          headers: { 'App-Token': this.appToken, 'Session-Token': sessionToken },
        })
      );
    } finally {
      await this.killSession(sessionToken);
    }
  }

  async eliminarDocumento(docId: number) {
    this.assertConfigured();
    const sessionToken = await this.initSession();
    try {
      const client = this.getClient();
      const headers = { 'App-Token': this.appToken, 'Session-Token': sessionToken };

      // 1. Eliminar Document_Item(s) vinculados a este documento
      try {
        const diRes = await client.get('/Document_Item', {
          headers,
          params: {
            'searchText[documents_id]': String(docId),
            'range': '0-100',
          },
        });
        const dis: any[] = Array.isArray(diRes.data) ? diRes.data : [];
        for (const di of dis) {
          if (di.id) {
            await client.delete(`/Document_Item/${di.id}`, {
              headers,
              data: { input: { id: di.id }, force_purge: 1 },
            }).catch(() => { /* best effort */ });
          }
        }
      } catch { /* continuar aunque falle */ }

      // 2. Purgar el documento permanentemente
      await this.callGlpi(`DELETE /Document/${docId}`, () =>
        client.delete(`/Document/${docId}`, {
          headers,
          data: { input: { id: docId }, force_purge: 1 },
        })
      );
      return { success: true };
    } finally {
      await this.killSession(sessionToken);
    }
  }

  async reemplazarDocumento(
    ticketId: number,
    docId: number,
    fileName: string,
    fileBuffer: Buffer,
    mimeType: string,
  ) {
    this.assertConfigured();
    const sessionToken = await this.initSession();
    let followupId: number | undefined;
    let solutionId: number | undefined;
    try {
      const client = this.getClient();
      const headers = { 'App-Token': this.appToken, 'Session-Token': sessionToken };
      // Find existing followup/solution links to preserve them
      try {
        const diRes = await client.get('/Document_Item', {
          headers,
          params: { 'searchText[documents_id]': String(docId), 'range': '0-100' },
        });
        const dis: any[] = Array.isArray(diRes.data) ? diRes.data : [];
        for (const di of dis) {
          if (di.itemtype === 'ITILFollowup' && di.items_id) followupId = Number(di.items_id);
          if (di.itemtype === 'ITILSolution' && di.items_id) solutionId = Number(di.items_id);
        }
      } catch { /* continue without preserved links */ }
    } finally {
      await this.killSession(sessionToken);
    }
    await this.eliminarDocumento(docId);
    return this.subirDocumento(ticketId, fileName, fileBuffer, mimeType, undefined, followupId, solutionId);
  }

  // ─── Activos: inventario de dispositivos móviles ───────────────────────────
  // Android -> Phone, iOS/iPadOS -> Computer (tipo "iPad"). A diferencia del
  // resto de este servicio (una sesión GLPI por llamada), aquí se abre UNA
  // sola sesión para toda la operación porque un solo registro implica varias
  // llamadas encadenadas (dedup + resolver catálogos + crear/actualizar).

  /** Busca un dropdown/catálogo de GLPI por nombre exacto; si no existe, lo crea. */
  private async resolverDropdown(
    client: AxiosInstance,
    headers: Record<string, string>,
    itemtype: string,
    nombre: string,
  ): Promise<number | undefined> {
    const valor = nombre?.trim();
    if (!valor) return undefined;
    const resp = await client.get(`/${itemtype}`, {
      headers,
      params: { 'searchText[name]': valor, range: '0-10' },
    });
    const items: any[] = Array.isArray(resp.data) ? resp.data : [];
    const exact = items.find(
      (i) => String(i?.name ?? '').trim().toLowerCase() === valor.toLowerCase(),
    );
    if (exact?.id != null) return Number(exact.id);

    const created = await client.post(`/${itemtype}`, { input: { name: valor } }, { headers });
    const newId = Array.isArray(created.data) ? created.data[0]?.id : created.data?.id;
    return newId != null ? Number(newId) : undefined;
  }

  /** Dedup: busca un Phone/Computer existente por número de serie o IMEI (otherserial). */
  private async buscarDispositivoExistente(
    client: AxiosInstance,
    headers: Record<string, string>,
    itemtype: 'Phone' | 'Computer',
    serial?: string,
    imei?: string,
  ): Promise<{ id: number } | null> {
    if (!serial && !imei) return null;
    // Sin forcedisplay, GLPI solo devuelve las columnas por defecto de la
    // vista de lista (que no incluyen el ID) — el bug hacia que id siempre
    // saliera undefined y esto nunca deduplicara, creando un activo nuevo
    // cada vez.
    const params: Record<string, unknown> = { range: '0-1', 'forcedisplay[0]': '2' };
    let idx = 0;
    if (serial) {
      params[`criteria[${idx}][field]`] = '5';
      params[`criteria[${idx}][searchtype]`] = 'equals';
      params[`criteria[${idx}][value]`] = serial;
      idx++;
    }
    if (imei) {
      if (idx > 0) params[`criteria[${idx}][link]`] = 'OR';
      params[`criteria[${idx}][field]`] = '6';
      params[`criteria[${idx}][searchtype]`] = 'equals';
      params[`criteria[${idx}][value]`] = imei;
    }
    const resp = await client.get(`/search/${itemtype}`, { headers, params });
    const rows: any[] = Array.isArray(resp.data?.data) ? resp.data.data : [];
    const id = rows[0]?.['2'];
    return id != null ? { id: Number(id) } : null;
  }

  /**
   * RAM/almacenamiento/batería/MAC/número de línea no tienen un campo simple
   * en Phone/Computer (RAM y disco viven en sub-recursos de componentes tipo
   * Item_DeviceMemory, que requieren resolver/crear catálogos de hardware
   * aparte) — se anotan como texto legible en comentarios en vez de modelar
   * esos sub-recursos, para no inventar datos estructurados de más.
   */
  private armarComentarioDispositivo(dto: any): string {
    const partes: string[] = [];
    if (dto.so || dto.soVersion) {
      partes.push(`SO: ${[dto.so, dto.soVersion].filter(Boolean).join(' ')}`);
    }
    if (dto.ramMb) partes.push(`RAM: ${(dto.ramMb / 1024).toFixed(1)} GB`);
    if (dto.almacenamientoTotalMb) {
      const libre = dto.almacenamientoLibreMb
        ? `${(dto.almacenamientoLibreMb / 1024).toFixed(1)} GB libres`
        : 'libre no reportado';
      partes.push(`Almacenamiento: ${(dto.almacenamientoTotalMb / 1024).toFixed(1)} GB total, ${libre}`);
    }
    if (dto.macWifi) partes.push(`MAC Wi-Fi: ${dto.macWifi}`);
    if (dto.bateriaNivel != null) partes.push(`Batería al registrar: ${dto.bateriaNivel}%`);
    if (dto.numeroTelefono) partes.push(`Número de línea: ${dto.numeroTelefono}`);
    partes.push(`Registrado vía GTO Docs el ${new Date().toISOString()}`);
    if (dto.comentarioExtra) partes.push(String(dto.comentarioExtra));
    return partes.join('\n');
  }

  async registrarDispositivoMovil(dto: any, glpiUserId?: number) {
    this.assertConfigured();
    if (!dto?.serial) {
      throw new BadRequestException('El número de serie es obligatorio para registrar el activo');
    }
    const itemtype: 'Phone' | 'Computer' = dto.os === 'android' ? 'Phone' : 'Computer';
    const esIpad = itemtype === 'Computer';

    const sessionToken = await this.initSession();
    try {
      const client = this.getClient();
      const headers = { 'App-Token': this.appToken, 'Session-Token': sessionToken };

      const existente = await this.buscarDispositivoExistente(
        client, headers, itemtype, dto.serial, dto.imei,
      );

      const manufacturers_id = dto.fabricante
        ? await this.resolverDropdown(client, headers, 'Manufacturer', dto.fabricante)
        : undefined;
      const modelo_id = dto.modelo
        ? await this.resolverDropdown(client, headers, esIpad ? 'ComputerModel' : 'PhoneModel', dto.modelo)
        : undefined;
      const tipo_id = esIpad
        ? await this.resolverDropdown(client, headers, 'ComputerType', 'iPad')
        : await this.resolverDropdown(client, headers, 'PhoneType', 'Smartphone');
      const autoupdatesystems_id = await this.resolverDropdown(
        client, headers, 'AutoUpdateSystem', 'GTO Docs',
      );

      const input: Record<string, unknown> = {
        name: dto.nombre?.trim() || dto.modelo?.trim() || `Dispositivo ${dto.serial}`,
        serial: dto.serial,
        comment: this.armarComentarioDispositivo(dto),
      };
      if (autoupdatesystems_id) input.autoupdatesystems_id = autoupdatesystems_id;
      if (dto.imei) input.otherserial = dto.imei;
      if (dto.uuid) input.uuid = dto.uuid;
      if (manufacturers_id) input.manufacturers_id = manufacturers_id;
      if (dto.numeroEmpleado) input.contact_num = dto.numeroEmpleado;
      if (glpiUserId) input.users_id_tech = glpiUserId;
      if (dto.usuarioId) input.users_id = dto.usuarioId;

      if (esIpad) {
        if (modelo_id) input.computermodels_id = modelo_id;
        if (tipo_id) input.computertypes_id = tipo_id;
      } else {
        if (modelo_id) input.phonemodels_id = modelo_id;
        if (tipo_id) input.phonetypes_id = tipo_id;
        if (dto.fabricante) input.brand = dto.fabricante;
      }

      let activoId: number;
      let actualizado = false;
      if (existente) {
        await this.callGlpi(`PUT /${itemtype}/${existente.id}`, () =>
          client.put(`/${itemtype}/${existente.id}`, { input: { id: existente.id, ...input } }, { headers }),
        );
        activoId = existente.id;
        actualizado = true;
      } else {
        const created = await this.callGlpi(`POST /${itemtype}`, () =>
          client.post(`/${itemtype}`, { input }, { headers }),
        );
        activoId = Number((created as any)?.id);
      }

      // Solo Computer tiene relación estructurada de Sistema Operativo; Phone
      // no la tiene en este GLPI (confirmado vía listSearchOptions), por eso
      // el SO de Android ya quedó como texto en el comentario arriba.
      if (esIpad && dto.soVersion) {
        try {
          const os_id = await this.resolverDropdown(client, headers, 'OperatingSystem', dto.so || 'iOS/iPadOS');
          const osver_id = await this.resolverDropdown(client, headers, 'OperatingSystemVersion', dto.soVersion);
          await client.post(
            '/Item_OperatingSystem',
            {
              input: {
                itemtype: 'Computer',
                items_id: activoId,
                operatingsystems_id: os_id,
                operatingsystemversions_id: osver_id,
              },
            },
            { headers },
          );
        } catch (e: any) {
          this.logger.warn(
            'No se pudo asociar SO al iPad: ' +
              (e?.response?.data ? JSON.stringify(e.response.data) : e?.message),
          );
        }
      }

      const frontPath = esIpad ? 'computer' : 'phone';
      const link = `${this.baseUrl.replace(/\/$/, '')}/front/${frontPath}.form.php?id=${activoId}`;

      return { id: activoId, itemtype, actualizado, link };
    } finally {
      await this.killSession(sessionToken);
    }
  }

}