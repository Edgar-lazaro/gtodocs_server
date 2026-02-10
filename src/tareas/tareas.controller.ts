import {
  Controller,
  Post,
  Get,
  Body,
  Req,
  UseGuards,
  Param,
  Patch,
  Delete,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import * as crypto from 'crypto';
import * as path from 'path';
import * as fs from 'fs';
import { TareasService } from './tareas.service';
import { JwtGuard } from '../auth/guards/jwt.guard';
import { Cargos } from '../auth/decorators/cargos.decorator';
import { CargosGuard } from '../auth/guards/cargos.guard';
import { CreateTareaDto } from './dto/create-tarea.dto';
import { UpdateTareaDto } from './dto/update-tarea.dto';
import { CreateTareaComentarioDto } from './dto/create-tarea-comentario.dto';
import { UpdateTareaEstadoDto } from './dto/update-tarea-estado.dto';
import { CreateTareaAdjuntoDto } from './dto/create-tarea-adjunto.dto';
import {
  buildPublicFileUrl,
  resolveAdjuntoRelativeDir,
  resolveUploadsRoot,
} from '../uploads/uploads.util';

@Controller('tareas')
@UseGuards(JwtGuard)
export class TareasController {
  constructor(private readonly tareasService: TareasService) {}

  @Get('mias')
  @UseGuards(JwtGuard)
  obtenerMisTareas(@Req() req: any) {
    const userId = req.user?.sub ?? req.user?.id;
    return this.tareasService.obtenerMisTareas(userId);
  }

  @Get()
  findAll(@Req() req: any) {
    const userId = req.user?.sub ?? req.user?.id;
    return this.tareasService.findAllForUser(userId, req.user?.cargoId);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @Req() req: any) {
    const userId = req.user?.sub ?? req.user?.id;
    return this.tareasService.findOneForUser(id, userId, req.user?.cargoId);
  }

  @Post('estado')
  @UseGuards(JwtGuard)
  actualizarEstado(@Req() req: any, @Body() dto: UpdateTareaEstadoDto) {
    const userId = req.user?.sub ?? req.user?.id;
    return this.tareasService.actualizarEstadoLegacy(
      userId,
      dto.id,
      dto.estado,
    );
  }

  /** Alternativa: PATCH /api/tareas/:id/estado con body { estado } */
  @Patch(':id/estado')
  @UseGuards(JwtGuard)
  actualizarEstadoPorId(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: { estado: UpdateTareaEstadoDto['estado'] },
  ) {
    const userId = req.user?.sub ?? req.user?.id;
    return this.tareasService.actualizarEstadoLegacy(userId, id, body.estado);
  }

  @Post('comentarios')
  @UseGuards(JwtGuard)
  comentar(@Req() req: any, @Body() dto: CreateTareaComentarioDto) {
    const userId = req.user?.sub ?? req.user?.id;
    return this.tareasService.comentarLegacy(userId, dto.tareaId, dto.mensaje);
  }

  @Post('adjuntos')
  @UseGuards(JwtGuard)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: (_req, file, cb) => {
          const uploadsRoot = resolveUploadsRoot();
          const relative = resolveAdjuntoRelativeDir('tareas', {
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
    }),
  )
  async adjuntar(
    @Req() req: any,
    @Body() dto: CreateTareaAdjuntoDto,
    @UploadedFile()
    file?: {
      filename: string;
      originalname?: string;
      mimetype?: string;
      path?: string;
    },
  ) {
    const userId = req.user?.sub ?? req.user?.id;
    if (!file) {
      return this.tareasService.adjuntarLegacy(
        userId,
        dto.tareaId,
        dto.tipo,
        dto.nombre,
        null,
      );
    }

    const relative = resolveAdjuntoRelativeDir('tareas', {
      originalname: file.originalname,
      mimetype: file.mimetype,
    });

    const url = buildPublicFileUrl(req, relative, file.filename);
    return this.tareasService.adjuntarLegacy(
      userId,
      dto.tareaId,
      dto.tipo,
      dto.nombre,
      url,
    );
  }

  @Post()
  crear(@Req() req: any, @Body() dto: CreateTareaDto) {
    const userId = req.user?.sub ?? req.user?.id;
    return this.tareasService.crear(userId, dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateTareaDto) {
    return this.tareasService.update(id, dto);
  }

  @Delete(':id')
  @UseGuards(CargosGuard)
  @Cargos(1, 2)
  remove(@Param('id') id: string) {
    return this.tareasService.remove(id);
  }
}
