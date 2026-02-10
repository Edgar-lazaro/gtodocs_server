import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { parseBigIntId, serializeBigInt } from '../common/serialize-bigint';
import { CreateTareaAsignacionDto } from './dto/create-tarea-asignacion.dto';
import { UpdateTareaAsignacionDto } from './dto/update-tarea-asignacion.dto';

@Injectable()
export class TareaAsignacionesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    const rows = await this.prisma.tarea_asignaciones.findMany({
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

    const row = await this.prisma.tarea_asignaciones.findUnique({
      where: { id },
    });
    if (!row) throw new NotFoundException('Not found');
    return serializeBigInt(row);
  }

  async create(dto: CreateTareaAsignacionDto) {
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

    const created = await this.prisma.tarea_asignaciones.create({
      data: {
        fecha_asignacion: dto.fecha_asignacion
          ? new Date(dto.fecha_asignacion)
          : undefined,
        tareas: { connect: { id: tareaId } },
        User: { connect: { id: dto.usuario_id } },
      } as any,
    });

    return serializeBigInt(created);
  }

  async update(idRaw: string, dto: UpdateTareaAsignacionDto) {
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
      fecha_asignacion: dto.fecha_asignacion
        ? new Date(dto.fecha_asignacion)
        : undefined,
      tareas: connectTarea,
      User: connectUsuario,
    };

    try {
      const updated = await this.prisma.tarea_asignaciones.update({
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
      const deleted = await this.prisma.tarea_asignaciones.delete({
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
