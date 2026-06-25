import axios, { AxiosInstance, AxiosResponse } from 'axios';
import { Injectable, ServiceUnavailableException, BadRequestException, Logger } from '@nestjs/common';

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
    const params: Record<string, unknown> = { range: '0-999', sort: 'date_mod', order: 'DESC' };
    if (criteria?.length) {
      criteria.forEach((c, i) => {
        Object.entries(c).forEach(([k, v]) => { params[`criteria[${i}][${k}]`] = v; });
      });
    }
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
    _status: number,   // reservado para compatibilidad; GLPI gestiona su propio estado
    userId?: number,
  ) {
    this.assertConfigured();
    // No enviamos "status" en el input: dejamos que GLPI asigne el estado de validación
    // según su configuración interna. Esto evita que el campo sea ignorado o malinterpretado.
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

      // 1. Crear la solución en GLPI
      const solutionRes = await this.callGlpi('POST /ITILSolution', () =>
        client.post('/ITILSolution', data, { headers })
      );

      // GLPI gestiona el estado del ticket automáticamente al crear la solución.
      // NO revertimos el estado: hacerlo hace que GLPI marque la solución como rechazada.
      return { id: Number((solutionRes as any)?.id ?? 0) };
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
      for (const v of validations) {
        items.push({
          tipo: 'validation',
          id: v.id,
          contenido: v.comment_submission ?? '',
          usuarioId: v.users_id,
          usuarioNombre: userMap.get(Number(v.users_id)) ?? null,
          fecha: v.submission_date ?? '',
          estado: v.status,
          usuarioValidacion: v.users_id_validate,
        });
      }

      items.sort((a, b) => new Date(a.fecha).getTime() - new Date(b.fecha).getTime());
      return items;
    } finally {
      await this.killSession(sessionToken);
    }
  }

  // ─── Users ────────────────────────────────────────────────────────────────

  async listUsers(): Promise<GlpiListUserResponse> {
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

}