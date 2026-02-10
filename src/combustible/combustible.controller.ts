import {
  Body,
  BadRequestException,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Req,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import type { Request } from 'express';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import * as fs from 'fs';
import * as path from 'path';
import { JwtGuard } from '../auth/guards/jwt.guard';
import { Cargos } from '../auth/decorators/cargos.decorator';
import { CargosGuard } from '../auth/guards/cargos.guard';
import { CombustibleService } from './combustible.service';
import { CreateCombustibleDto } from './dto/create-combustible.dto';
import { CreateCombustibleUploadDto } from './dto/create-combustible-upload.dto';
import { UpdateCombustibleDto } from './dto/update-combustible.dto';
import {
  buildPublicFileUrl,
  resolveAdjuntoRelativeDir,
  resolveUploadsRoot,
} from '../uploads/uploads.util';

@Controller('combustible')
@UseGuards(JwtGuard)
export class CombustibleController {
  constructor(private readonly service: CombustibleService) {}

  @Get()
  findAll() {
    return this.service.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Post()
  create(@Body() dto: CreateCombustibleDto, @Req() req: Request) {
    return this.service.create(dto, (req as any).user);
  }

  @Post('upload')
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(
    FileFieldsInterceptor(
      [
        { name: 'foto_ini', maxCount: 1 },
        { name: 'foto_fin', maxCount: 1 },
      ],
      {
        storage: diskStorage({
          destination: (req, file, cb) => {
            const uploadsRoot = resolveUploadsRoot();
            const relative = resolveAdjuntoRelativeDir('checklists', {
              originalname: file.originalname,
              mimetype: file.mimetype,
            });
            const dir = path.join(uploadsRoot, relative);
            fs.mkdirSync(dir, { recursive: true });
            cb(null, dir);
          },
          filename: (req, file, cb) => {
            const ext = (path.extname(file.originalname) || '').toLowerCase();
            const base = path
              .basename(file.originalname, ext)
              .replace(/[^a-zA-Z0-9_-]+/g, '_')
              .slice(0, 50);
            cb(null, `${Date.now()}_${base || 'foto'}${ext || ''}`);
          },
        }),
        fileFilter: (req, file, cb) => {
          const ok = (file.mimetype || '').toLowerCase().startsWith('image/');
          cb(null, ok);
        },
        limits: { fileSize: 15 * 1024 * 1024 },
      },
    ),
  )
  async upload(
    @UploadedFiles()
    files: { foto_ini?: any[]; foto_fin?: any[] },
    @Body() dto: CreateCombustibleUploadDto,
    @Req() req: Request,
  ) {
    const fotoIni = files?.foto_ini?.[0];
    const fotoFin = files?.foto_fin?.[0];
    if (!fotoIni || !fotoFin) {
      // Frontend wants 1:1; enforce both
      throw new BadRequestException('foto_ini y foto_fin son requeridas');
    }

    const uploadsRoot = resolveUploadsRoot();
    const relativeIni = path.relative(uploadsRoot, path.dirname(fotoIni.path));
    const relativeFin = path.relative(uploadsRoot, path.dirname(fotoFin.path));

    const fotoIniJson = {
      url: buildPublicFileUrl(req, relativeIni, fotoIni.filename),
      filename: fotoIni.filename,
      originalname: fotoIni.originalname,
      mimetype: fotoIni.mimetype,
      size: fotoIni.size,
    };
    const fotoFinJson = {
      url: buildPublicFileUrl(req, relativeFin, fotoFin.filename),
      filename: fotoFin.filename,
      originalname: fotoFin.originalname,
      mimetype: fotoFin.mimetype,
      size: fotoFin.size,
    };

    return this.service.create(
      {
        ...(dto as any),
        foto_ini: fotoIniJson,
        foto_fin: fotoFinJson,
      },
      (req as any).user,
    );
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateCombustibleDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @UseGuards(CargosGuard)
  @Cargos(1, 2)
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
