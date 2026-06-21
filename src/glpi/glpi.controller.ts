import {
  Controller,
  Delete,
  Get,
  Post,
  Patch,
  Put,
  Body,
  Param,
  Req,
  Res,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import type { Response } from 'express';
import { GlpiService } from './glpi.service';
import { JwtGuard } from '../auth/guards/jwt.guard';

// Static catalogs ────────────────────────────────────────────────────────────

const FUENTES_SOLICITUD = [
  { id: 1, nombre: 'Helpdesk' },
  { id: 2, nombre: 'Email' },
  { id: 3, nombre: 'Teléfono' },
  { id: 4, nombre: 'Presencial' },
  { id: 5, nombre: 'Escrito' },
  { id: 6, nombre: 'REST API' },
];

const TIPOS_SOLUCION = [
  { id: 1, nombre: 'Solucionado' },
  { id: 2, nombre: 'Duplicado' },
  { id: 3, nombre: 'No aplica' },
  { id: 4, nombre: 'Error conocido' },
];

const CATEGORIAS_TAREA = [{ id: 0, nombre: 'Sin categoría' }];

// Controller ─────────────────────────────────────────────────────────────────

@Controller('glpi')
@UseGuards(JwtGuard)
export class GlpiController {
  constructor(private readonly glpiService: GlpiService) {}

  // ── Tickets ───────────────────────────────────────────────────────────────

  @Post('tickets')
  crearTicket(@Body() dto: any) {
    return this.glpiService.crearTicket(dto);
  }

  @Get('tickets')
  obtenerTickets() {
    return this.glpiService.obtenerTickets();
  }

  @Get('tickets/creados')
  async obtenerCreados(@Req() req: any) {
    // glpiUserId viene del JWT (incluido en el payload desde el login)
    const glpiUserId: number | null = req.user?.glpiUserId ?? null;
    if (!glpiUserId) return [];
    return this.glpiService.obtenerTickets([
      { field: '4', searchtype: 'equals', value: String(glpiUserId) },
    ]);
  }

  @Get('tickets/asignados')
  async obtenerAsignados(@Req() req: any) {
    const glpiUserId: number | null = req.user?.glpiUserId ?? null;
    if (!glpiUserId) return [];
    return this.glpiService.obtenerTickets([
      { field: '5', searchtype: 'equals', value: String(glpiUserId) },
    ]);
  }

  @Get('tickets/:id')
  obtenerTicketPorId(@Param('id') id: string) {
    return this.glpiService.obtenerTicketPorId(Number(id));
  }

  @Patch('tickets/:id/status')
  cambiarStatus(
    @Param('id') id: string,
    @Body() body: { status: number },
  ) {
    return this.glpiService.cambiarStatusTicket(Number(id), body.status);
  }

  // ── Timeline ──────────────────────────────────────────────────────────────

  @Get('tickets/:id/timeline')
  obtenerTimeline(@Param('id') id: string) {
    return this.glpiService.obtenerTimeline(Number(id));
  }

  // ── Followups ─────────────────────────────────────────────────────────────

  @Post('tickets/:id/followups')
  async crearFollowup(
    @Param('id') id: string,
    @Body() body: { content: string; is_private?: number; requesttypes_id?: number },
    @Req() req: any,
  ) {
    const username = req.user?.username ?? req.user?.sub;
    const glpiUserId = username
      ? await this.glpiService.findGlpiUserIdByUsername(username)
      : null;
    return this.glpiService.crearFollowup(Number(id), body.content, glpiUserId ?? undefined, {
      is_private: body.is_private,
      requesttypes_id: body.requesttypes_id,
    });
  }

  // ── Tasks ─────────────────────────────────────────────────────────────────

  @Post('tickets/:id/tasks')
  crearTask(
    @Param('id') id: string,
    @Body() dto: {
      content: string;
      state?: number;
      users_id_tech?: number;
      taskcategories_id?: number;
      begin?: string;
      plan_end?: string;
      actiontime?: number;
      is_private?: number;
    },
  ) {
    return this.glpiService.crearTask(Number(id), dto as Record<string, unknown>);
  }

  // ── Solution ──────────────────────────────────────────────────────────────

  @Post('tickets/:id/solution')
  async crearSolucion(
    @Param('id') id: string,
    @Body() body: { content: string; solutiontypes_id?: number; status?: number },
    @Req() req: any,
  ) {
    const username = req.user?.username ?? req.user?.sub;
    const glpiUserId = username
      ? await this.glpiService.findGlpiUserIdByUsername(username)
      : null;
    return this.glpiService.crearSolucionConTipo(
      Number(id),
      body.content,
      body.solutiontypes_id ?? 1,
      body.status ?? 1,
      glpiUserId ?? undefined,
    );
  }

  @Patch('solutions/:solutionId/approve')
  aprobarSolucion(
    @Param('solutionId') solutionId: string,
    @Body() body: { approved: boolean },
  ) {
    return this.glpiService.aprobarSolucion(Number(solutionId), body.approved);
  }

  // ── Documents ─────────────────────────────────────────────────────────────

  /**
   * Recibe el archivo con field name "file" (memory storage = buffer siempre disponible).
   * Nombre personalizado opcional en el body field "nombre".
   */
  @Post('tickets/:id/documents')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 50 * 1024 * 1024 }, // 50 MB
    }),
  )
  async subirDocumento(
    @Param('id') id: string,
    @Body() body: { nombre?: string; usuarioId?: string; followupId?: string },
    @UploadedFile() file?: any,
  ) {
    if (!file) {
      throw new BadRequestException('No se recibió ningún archivo (field "file" requerido)');
    }
    const buffer = file.buffer;
    if (!buffer || buffer.length === 0) {
      throw new BadRequestException('El archivo recibido está vacío');
    }
    const nombre = body?.nombre || file.originalname || 'documento';
    const mime = file.mimetype || 'application/octet-stream';
    const uid = body?.usuarioId ? Number(body.usuarioId) : undefined;
    const fid = body?.followupId ? Number(body.followupId) : undefined;
    return this.glpiService.subirDocumento(Number(id), nombre, buffer, mime, uid, fid);
  }

  // ── Validation ────────────────────────────────────────────────────────────

  @Post('tickets/:id/validation')
  solicitarValidacion(
    @Param('id') id: string,
    @Body() body: { validatorUserId: number; comment: string },
  ) {
    return this.glpiService.solicitarValidacion(Number(id), body.validatorUserId, body.comment);
  }

  // ── Catalogs ──────────────────────────────────────────────────────────────

  @Get('usuarios')
  listarUsuarios() {
    return this.glpiService.listarUsuariosGlpi();
  }

  @Get('fuentes-solicitud')
  listarFuentes() {
    return FUENTES_SOLICITUD;
  }

  @Get('tipos-solucion')
  listarTiposSolucion() {
    return TIPOS_SOLUCION;
  }

  @Get('categorias-tarea')
  listarCategoriasTarea() {
    return CATEGORIAS_TAREA;
  }
  // ── List documents ────────────────────────────────────────────────────────

  @Get('tickets/:id/documents')
  listarDocumentos(@Param('id') id: string) {
    return this.glpiService.listarDocumentosDeTicket(Number(id));
  }

  // ── Download document ─────────────────────────────────────────────────────

  @Get('documents/:id/download')
  async descargarDocumento(
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    const { buffer, contentType, filename } =
      await this.glpiService.descargarDocumentoBytes(Number(id));
    res.set('Content-Type', contentType);
    res.set('Content-Disposition', `attachment; filename="${filename}"`);
    res.set('Content-Length', String(buffer.length));
    res.end(buffer);
  }

  // ── Edit followup ─────────────────────────────────────────────────────────

  @Patch('followups/:id')
  editarSeguimiento(
    @Param('id') id: string,
    @Body() body: { content: string },
  ) {
    return this.glpiService.editarSeguimiento(Number(id), body.content);
  }

  // ── Delete document ───────────────────────────────────────────────────────

  @Delete('documents/:id')
  eliminarDocumento(@Param('id') id: string) {
    return this.glpiService.eliminarDocumento(Number(id));
  }

  // ── Replace document ──────────────────────────────────────────────────────

  @Put('tickets/:ticketId/documents/:docId')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 50 * 1024 * 1024 },
    }),
  )
  async reemplazarDocumento(
    @Param('ticketId') ticketId: string,
    @Param('docId') docId: string,
    @Body() body: { nombre?: string },
    @UploadedFile() file?: any,
  ) {
    if (!file) throw new BadRequestException('No se recibió archivo');
    const nombre = body?.nombre || file.originalname || 'documento';
    return this.glpiService.reemplazarDocumento(
      Number(ticketId),
      Number(docId),
      nombre,
      file.buffer,
      file.mimetype ?? 'application/octet-stream',
    );
  }
}