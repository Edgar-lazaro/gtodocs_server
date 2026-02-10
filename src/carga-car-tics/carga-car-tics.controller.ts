import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import * as path from 'path';
import * as fs from 'fs';
import * as crypto from 'crypto';
import type { Request } from 'express';
import { JwtGuard } from '../auth/guards/jwt.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CargaCarTicsService } from './carga-car-tics.service';
import { CreateCargaCarTicsDto } from './dto/create-carga-car-tics.dto';
import { CreateCargaCarTicsUploadDto } from './dto/create-carga-car-tics-upload.dto';
import { UpdateCargaCarTicsDto } from './dto/update-carga-car-tics.dto';
import {
  buildPublicFileUrl,
  resolveAdjuntoRelativeDir,
  resolveUploadsRoot,
} from '../uploads/uploads.util';

@Controller('carga-car-tics')
@UseGuards(JwtGuard, RolesGuard)
export class CargaCarTicsController {
  constructor(private readonly service: CargaCarTicsService) {}

  @Get()
  findAll(@Query('gerenciaId') gerenciaId?: string) {
    const id = gerenciaId ? parseInt(gerenciaId, 10) : undefined;
    return this.service.findAll(id && !isNaN(id) ? id : undefined);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Post()
  create(@Body() dto: CreateCargaCarTicsDto) {
    return this.service.create(dto);
  }

  @Post('upload')
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(
    FileFieldsInterceptor(
      [
        { name: 'foto_km_bf', maxCount: 1 },
        { name: 'foto_km_af', maxCount: 1 },
        { name: 'foto_ticket', maxCount: 1 },
      ],
      {
        storage: diskStorage({
          destination: (_req, file, cb) => {
            const uploadsRoot = resolveUploadsRoot();
            const relative = resolveAdjuntoRelativeDir('carga-car-tics', {
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
            const ext = path.extname(file.originalname || '') || '.jpg';
            cb(null, `${crypto.randomUUID()}${ext}`);
          },
        }),
        fileFilter: (_req, file, cb) => {
          const ok = (file?.mimetype ?? '').toLowerCase().startsWith('image/');
          cb(null, ok);
        },
        limits: { fileSize: 10 * 1024 * 1024 },
      },
    ),
  )
  async upload(
    @Req() req: Request & { user?: any },
    @UploadedFiles()
    files: {
      foto_km_bf?: {
        filename: string;
        originalname?: string;
        mimetype?: string;
      }[];
      foto_km_af?: {
        filename: string;
        originalname?: string;
        mimetype?: string;
      }[];
      foto_ticket?: {
        filename: string;
        originalname?: string;
        mimetype?: string;
      }[];
    },
    @Body() dto: CreateCargaCarTicsUploadDto,
  ) {
    const fotoKmBf = files?.foto_km_bf?.[0];
    const fotoKmAf = files?.foto_km_af?.[0];
    const fotoTicket = files?.foto_ticket?.[0];

    if (!fotoKmBf || !fotoKmAf || !fotoTicket) {
      throw new BadRequestException(
        'foto_km_bf, foto_km_af y foto_ticket son requeridas',
      );
    }

    const relativeDir = resolveAdjuntoRelativeDir('carga-car-tics', {
      originalname: fotoKmBf.originalname,
      mimetype: fotoKmBf.mimetype,
    });
    const urlKmBf = buildPublicFileUrl(req, relativeDir, fotoKmBf.filename);
    const urlKmAf = buildPublicFileUrl(req, relativeDir, fotoKmAf.filename);
    const urlTicket = buildPublicFileUrl(req, relativeDir, fotoTicket.filename);

    return this.service.createFromUpload(dto, {
      foto_km_bf: urlKmBf,
      foto_km_af: urlKmAf,
      foto_ticket: urlTicket,
    });
  }

  @Patch(':id')
  @Roles('ADMIN')
  update(@Param('id') id: string, @Body() dto: UpdateCargaCarTicsDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @Roles('ADMIN')
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
