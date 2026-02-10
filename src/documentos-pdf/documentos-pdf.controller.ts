import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import * as crypto from 'crypto';
import * as path from 'path';
import * as fs from 'fs';
import type { Request } from 'express';
import { JwtGuard } from '../auth/guards/jwt.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { DocumentosPdfService } from './documentos-pdf.service';
import { CreateDocumentoPdfDto } from './dto/create-documento-pdf.dto';
import { CreateDocumentoPdfUploadDto } from './dto/create-documento-pdf-upload.dto';
import { UpdateDocumentoPdfDto } from './dto/update-documento-pdf.dto';
import {
  buildPublicFileUrl,
  resolveAdjuntoRelativeDir,
  resolveUploadsRoot,
} from '../uploads/uploads.util';

@Controller('documentos-pdf')
@UseGuards(JwtGuard, RolesGuard)
export class DocumentosPdfController {
  constructor(private readonly service: DocumentosPdfService) {}

  @Get()
  findAll(@Req() req: any) {
    const userId = req.user?.sub ?? req.user?.id;
    const roles: string[] = Array.isArray(req.user?.roles)
      ? req.user.roles
      : [];
    const gerenciaIdRaw = req.user?.gerenciaId;
    const gerenciaId =
      gerenciaIdRaw === null || gerenciaIdRaw === undefined
        ? null
        : Number(gerenciaIdRaw);
    const jefaturaIdRaw = req.user?.jefaturaId;
    const jefaturaId =
      jefaturaIdRaw === null || jefaturaIdRaw === undefined
        ? null
        : Number(jefaturaIdRaw);
    return this.service.findAllForUser(
      userId,
      roles,
      Number.isFinite(gerenciaId) ? gerenciaId : null,
      Number.isFinite(jefaturaId) ? jefaturaId : null,
    );
  }

  @Get('mios')
  findMine(@Req() req: any) {
    const userId = req.user?.sub ?? req.user?.id;
    return this.service.findMine(userId);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @Req() req: any) {
    const userId = req.user?.sub ?? req.user?.id;
    const roles: string[] = Array.isArray(req.user?.roles)
      ? req.user.roles
      : [];
    const gerenciaIdRaw = req.user?.gerenciaId;
    const gerenciaId =
      gerenciaIdRaw === null || gerenciaIdRaw === undefined
        ? null
        : Number(gerenciaIdRaw);
    const jefaturaIdRaw = req.user?.jefaturaId;
    const jefaturaId =
      jefaturaIdRaw === null || jefaturaIdRaw === undefined
        ? null
        : Number(jefaturaIdRaw);
    return this.service.findOneForUser(
      id,
      userId,
      roles,
      Number.isFinite(gerenciaId) ? gerenciaId : null,
      Number.isFinite(jefaturaId) ? jefaturaId : null,
    );
  }

  @Post()
  @Roles('ADMIN', 'JEFE', 'USER')
  create(@Req() req: any, @Body() dto: CreateDocumentoPdfDto) {
    const userId = req.user?.sub ?? req.user?.id;
    const username = String(req.user?.username ?? '').trim();
    const roles: string[] = Array.isArray(req.user?.roles)
      ? req.user.roles
      : [];
    const isAdmin = roles.some((r) => String(r).toUpperCase() === 'ADMIN');
    const isJefe = roles.some((r) => String(r).toUpperCase() === 'JEFE');

    const gerenciaIdRaw = req.user?.gerenciaId;
    const jefaturaIdRaw = req.user?.jefaturaId;
    const gerenciaId =
      gerenciaIdRaw === null || gerenciaIdRaw === undefined
        ? null
        : Number(gerenciaIdRaw);
    const jefaturaId =
      jefaturaIdRaw === null || jefaturaIdRaw === undefined
        ? null
        : Number(jefaturaIdRaw);

    const jwtGerenciaId = Number.isFinite(gerenciaId) ? gerenciaId : null;
    const jwtJefaturaId = Number.isFinite(jefaturaId) ? jefaturaId : null;

    // ADMIN solo puede crear/registrar dentro de su gerencia.
    if (isAdmin && jwtGerenciaId === null) {
      throw new ForbiddenException('ADMIN sin gerencia asignada');
    }
    // JEFE solo puede crear/registrar dentro de su jefatura.
    if (isJefe && jwtJefaturaId === null) {
      throw new ForbiddenException('JEFE sin jefatura asignada');
    }

    // Si el JWT trae gerencia/jefatura, exigir que coincidan con el body (evita spoofing).
    if (jwtGerenciaId !== null && dto.gerencia_id !== jwtGerenciaId) {
      throw new ForbiddenException(
        'No puedes registrar documentos para otra gerencia',
      );
    }
    if (jwtJefaturaId !== null && dto.jefatura_id !== jwtJefaturaId) {
      throw new ForbiddenException(
        'No puedes registrar documentos para otra jefatura',
      );
    }

    return this.service.create(
      userId,
      {
        username,
        gerenciaId: jwtGerenciaId,
        jefaturaId: jwtJefaturaId,
      },
      dto,
    );
  }

  @Post('upload')
  @Roles('ADMIN', 'JEFE', 'USER')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: (_req, file, cb) => {
          const uploadsRoot = resolveUploadsRoot();
          // documentos_pdf is currently tied to checklist flows, so we store under the checklists bucket.
          const relative = resolveAdjuntoRelativeDir('checklists', {
            originalname: file?.originalname,
            mimetype: file?.mimetype,
          });
          const dest = path.join(uploadsRoot, relative);
          try {
            fs.mkdirSync(dest, { recursive: true });
          } catch (err) {
            cb(err as Error, dest);
            return;
          }
          cb(null, dest);
        },
        filename: (_req, file, cb) => {
          const ext = path.extname(file.originalname || '');
          const name = `${crypto.randomUUID()}${ext}`;
          cb(null, name);
        },
      }),
      fileFilter: (_req, file, cb) => {
        const mimetype = String(file?.mimetype ?? '').toLowerCase();
        const ext = String(
          path.extname(file?.originalname ?? ''),
        ).toLowerCase();
        if (mimetype === 'application/pdf' || ext === '.pdf') {
          cb(null, true);
          return;
        }
        cb(new Error('Solo se permite PDF'), false);
      },
    }),
  )
  async upload(
    @Req() req: Request & { user?: any },
    @Body() body: CreateDocumentoPdfUploadDto,
    @UploadedFile()
    file?: {
      filename: string;
      originalname?: string;
      mimetype?: string;
      size?: number;
    },
  ) {
    if (!file) {
      throw new ForbiddenException('Archivo PDF requerido');
    }

    const userId = req.user?.sub ?? req.user?.id;
    const username = String(req.user?.username ?? '').trim();
    const roles: string[] = Array.isArray(req.user?.roles)
      ? req.user.roles
      : [];
    const isAdmin = roles.some((r) => String(r).toUpperCase() === 'ADMIN');
    const isJefe = roles.some((r) => String(r).toUpperCase() === 'JEFE');

    const gerenciaIdRaw = req.user?.gerenciaId;
    const jefaturaIdRaw = req.user?.jefaturaId;
    const gerenciaId =
      gerenciaIdRaw === null || gerenciaIdRaw === undefined
        ? null
        : Number(gerenciaIdRaw);
    const jefaturaId =
      jefaturaIdRaw === null || jefaturaIdRaw === undefined
        ? null
        : Number(jefaturaIdRaw);

    const jwtGerenciaId = Number.isFinite(gerenciaId) ? gerenciaId : null;
    const jwtJefaturaId = Number.isFinite(jefaturaId) ? jefaturaId : null;

    if (isAdmin && jwtGerenciaId === null) {
      throw new ForbiddenException('ADMIN sin gerencia asignada');
    }
    if (isJefe && jwtJefaturaId === null) {
      throw new ForbiddenException('JEFE sin jefatura asignada');
    }

    if (jwtGerenciaId !== null && body.gerencia_id !== jwtGerenciaId) {
      throw new ForbiddenException(
        'No puedes registrar documentos para otra gerencia',
      );
    }
    if (jwtJefaturaId !== null && body.jefatura_id !== jwtJefaturaId) {
      throw new ForbiddenException(
        'No puedes registrar documentos para otra jefatura',
      );
    }

    const relative = resolveAdjuntoRelativeDir('checklists', {
      originalname: file.originalname,
      mimetype: file.mimetype,
    });
    const url = buildPublicFileUrl(req, relative, file.filename);

    const dto: CreateDocumentoPdfDto = {
      nombre_archivo: (
        body.nombre_archivo ??
        file.originalname ??
        file.filename
      ).toString(),
      tipo_documento: body.tipo_documento,
      url_storage: url,
      usuario_nombre: body.usuario_nombre,
      gerencia_id: body.gerencia_id,
      jefatura_id: body.jefatura_id,
      checklist_nombre: body.checklist_nombre,
      tamano_bytes: (body.tamano_bytes ??
        (Number.isFinite(file.size) ? String(file.size) : undefined)) as any,
    };

    return this.service.create(
      userId,
      {
        username,
        gerenciaId: jwtGerenciaId,
        jefaturaId: jwtJefaturaId,
      },
      dto,
    );
  }

  @Patch(':id')
  @Roles('ADMIN')
  update(@Param('id') id: string, @Body() dto: UpdateDocumentoPdfDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @Roles('ADMIN')
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
