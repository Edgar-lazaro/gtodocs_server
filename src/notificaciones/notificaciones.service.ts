import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { parseBigIntId, serializeBigInt } from '../common/serialize-bigint';
import { CreateNotificacionDto } from './dto/create-notificacion.dto';
import { UpdateNotificacionDto } from './dto/update-notificacion.dto';

@Injectable()
export class NotificacionesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    const rows = await this.prisma.notificaciones.findMany({
      orderBy: { id: 'desc' },
    });
    return serializeBigInt(rows);
  }

  async findOne(idRaw: string) {
    let id: bigint;
    try {
      id = parseBigIntId(idRaw);
    } catch {
      throw new BadRequestException('Invalid id');
    }

    const row = await this.prisma.notificaciones.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Not found');
    return serializeBigInt(row);
  }

  async create(dto: CreateNotificacionDto) {
    const usuario = await this.prisma.user.findUnique({
      where: { id: dto.usuario_id },
      select: { id: true },
    });
    if (!usuario)
      throw new BadRequestException(`usuario_id no existe: ${dto.usuario_id}`);

    const created = await this.prisma.notificaciones.create({
      data: {
        tipo: dto.tipo,
        titulo: dto.titulo,
        mensaje: dto.mensaje,
        datos_adicionales: dto.datos_adicionales,
        leida: dto.leida,
        User: { connect: { id: dto.usuario_id } },
      } as any,
    });
    return serializeBigInt(created);
  }

  async update(idRaw: string, dto: UpdateNotificacionDto) {
    let id: bigint;
    try {
      id = parseBigIntId(idRaw);
    } catch {
      throw new BadRequestException('Invalid id');
    }

    if (dto.usuario_id !== undefined) {
      const usuario = await this.prisma.user.findUnique({
        where: { id: dto.usuario_id },
        select: { id: true },
      });
      if (!usuario)
        throw new BadRequestException(
          `usuario_id no existe: ${dto.usuario_id}`,
        );
    }

    const data: any = {
      tipo: dto.tipo,
      titulo: dto.titulo,
      mensaje: dto.mensaje,
      datos_adicionales: dto.datos_adicionales,
      leida: dto.leida,
      User: dto.usuario_id ? { connect: { id: dto.usuario_id } } : undefined,
    };

    try {
      const updated = await this.prisma.notificaciones.update({
        where: { id },
        data,
      });
      return serializeBigInt(updated);
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2025'
      ) {
        throw new NotFoundException('Not found');
      }
      throw err;
    }
  }

  async remove(idRaw: string) {
    let id: bigint;
    try {
      id = parseBigIntId(idRaw);
    } catch {
      throw new BadRequestException('Invalid id');
    }

    try {
      const deleted = await this.prisma.notificaciones.delete({
        where: { id },
      });
      return serializeBigInt(deleted);
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2025'
      ) {
        throw new NotFoundException('Not found');
      }
      throw err;
    }
  }
}
