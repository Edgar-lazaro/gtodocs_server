import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { parseBigIntId, serializeBigInt } from '../common/serialize-bigint';
import { CreateTareaAvanceDto } from './dto/create-tarea-avance.dto';
import { UpdateTareaAvanceDto } from './dto/update-tarea-avance.dto';

@Injectable()
export class TareaAvancesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    const rows = await this.prisma.tarea_avances.findMany({
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

    const row = await this.prisma.tarea_avances.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Not found');
    return serializeBigInt(row);
  }

  async create(dto: CreateTareaAvanceDto) {
    const tareaId = BigInt(dto.tarea_id);
    const tarea = await this.prisma.tareas.findUnique({
      where: { id: tareaId },
      select: { id: true },
    });
    if (!tarea)
      throw new BadRequestException(`tarea_id no existe: ${dto.tarea_id}`);

    const usuario = await this.prisma.user.findUnique({
      where: { id: dto.usuario_id },
      select: { id: true },
    });
    if (!usuario)
      throw new BadRequestException(`usuario_id no existe: ${dto.usuario_id}`);

    const created = await this.prisma.tarea_avances.create({
      data: {
        descripcion: dto.descripcion,
        imagenes: dto.imagenes,
        fecha_creacion: dto.fecha_creacion
          ? new Date(dto.fecha_creacion)
          : undefined,
        tareas: { connect: { id: tareaId } },
        User: { connect: { id: dto.usuario_id } },
      } as any,
    });

    return serializeBigInt(created);
  }

  async update(idRaw: string, dto: UpdateTareaAvanceDto) {
    let id: bigint;
    try {
      id = parseBigIntId(idRaw);
    } catch {
      throw new BadRequestException('Invalid id');
    }

    let connectTarea: any = undefined;
    if (dto.tarea_id !== undefined) {
      const tareaId = BigInt(dto.tarea_id);
      const tarea = await this.prisma.tareas.findUnique({
        where: { id: tareaId },
        select: { id: true },
      });
      if (!tarea)
        throw new BadRequestException(`tarea_id no existe: ${dto.tarea_id}`);
      connectTarea = { connect: { id: tareaId } };
    }

    let connectUsuario: any = undefined;
    if (dto.usuario_id !== undefined) {
      const usuario = await this.prisma.user.findUnique({
        where: { id: dto.usuario_id },
        select: { id: true },
      });
      if (!usuario)
        throw new BadRequestException(
          `usuario_id no existe: ${dto.usuario_id}`,
        );
      connectUsuario = { connect: { id: dto.usuario_id } };
    }

    const data: any = {
      descripcion: dto.descripcion,
      imagenes: dto.imagenes,
      fecha_creacion: dto.fecha_creacion
        ? new Date(dto.fecha_creacion)
        : undefined,
      tareas: connectTarea,
      User: connectUsuario,
    };

    try {
      const updated = await this.prisma.tarea_avances.update({
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
      const deleted = await this.prisma.tarea_avances.delete({ where: { id } });
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
