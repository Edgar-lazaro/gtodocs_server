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
import { UsoCarTicsService } from './uso-car-tics.service';
import { CreateUsoCarTicsDto } from './dto/create-uso-car-tics.dto';
import { CreateUsoCarTicsUploadDto } from './dto/create-uso-car-tics-upload.dto';
import { UpdateUsoCarTicsDto } from './dto/update-uso-car-tics.dto';
import {
  buildPublicFileUrl,
  resolveAdjuntoRelativeDir,
  resolveUploadsRoot,
} from '../uploads/uploads.util';

@Controller('uso-car-tics')
@UseGuards(JwtGuard, RolesGuard)
export class UsoCarTicsController {
  constructor(private readonly service: UsoCarTicsService) {}

  @Get()
  findAll(@Query('gerenciaId') gerenciaId?: string) {
    const id = gerenciaId ? parseInt(gerenciaId, 10) : undefined;
    return this.service.findAll(id && !isNaN(id) ? id : undefined);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Post('upload')
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(
    FileFieldsInterceptor(
      [
        { name: 'foto_km_inicial', maxCount: 1 },
        { name: 'foto_km_final', maxCount: 1 },
      ],
      {
        storage: diskStorage({
          destination: (_req, file, cb) => {
            const uploadsRoot = resolveUploadsRoot();
            const relative = resolveAdjuntoRelativeDir('uso-car-tics', {
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
      foto_km_inicial?: {
        filename: string;
        originalname?: string;
        mimetype?: string;
      }[];
      foto_km_final?: {
        filename: string;
        originalname?: string;
        mimetype?: string;
      }[];
    },
    @Body() dto: CreateUsoCarTicsUploadDto,
  ) {
    const fotoKmInicial = files?.foto_km_inicial?.[0];
    const fotoKmFinal = files?.foto_km_final?.[0];

    if (!fotoKmInicial || !fotoKmFinal) {
      throw new BadRequestException(
        'foto_km_inicial y foto_km_final son requeridas',
      );
    }

    const relativeDir = resolveAdjuntoRelativeDir('uso-car-tics', {
      originalname: fotoKmInicial.originalname,
      mimetype: fotoKmInicial.mimetype,
    });
    const urlKmInicial = buildPublicFileUrl(
      req,
      relativeDir,
      fotoKmInicial.filename,
    );
    const urlKmFinal = buildPublicFileUrl(
      req,
      relativeDir,
      fotoKmFinal.filename,
    );

    return this.service.createFromUpload(dto, {
      foto_km_inicial: urlKmInicial,
      foto_km_final: urlKmFinal,
    });
  }

  @Post()
  create(@Body() dto: CreateUsoCarTicsDto) {
    return this.service.create(dto);
  }

  @Patch(':id')
  @Roles('ADMIN')
  update(@Param('id') id: string, @Body() dto: UpdateUsoCarTicsDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @Roles('ADMIN')
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
