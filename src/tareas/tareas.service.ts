import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { parseBigIntId, serializeBigInt } from '../common/serialize-bigint';
import { GlpiQueueService } from '../glpi/glpi-queue.service';
import { CreateTareaDto } from './dto/create-tarea.dto';
import { UpdateTareaDto } from './dto/update-tarea.dto';

@Injectable()
export class TareasService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly glpiQueue: GlpiQueueService,
  ) {}

  private async resolveUserIdFromIdOrUsername(value: string): Promise<string> {
    const raw = String(value ?? '').trim();
    if (!raw) {
      throw new BadRequestException('usuario_asignado es requerido');
    }

    const byId = await this.prisma.user.findUnique({
      where: { id: raw },
      select: { id: true },
    });
    if (byId) return byId.id;

    const byUsername = await this.prisma.user.findUnique({
      where: { username: raw },
      select: { id: true },
    });
    if (byUsername) return byUsername.id;

    throw new BadRequestException(
      `usuario_asignado no existe (ni como User.id ni como User.username): ${raw}`,
    );
  }

  private isPrivilegedCargo(cargoId: unknown): boolean {
    const id = Number(cargoId);
    return Number.isInteger(id) && (id === 1 || id === 2);
  }

  private normalizeEstado(raw: string) {
    if (raw === 'enProceso') return 'en_progreso';
    if (raw === 'en_proceso') return 'en_progreso';
    return raw;
  }

  async findAll() {
    const rows = await this.prisma.tareas.findMany({
      orderBy: { fecha_creacion: 'desc' },
      include: {
        tarea_asignaciones: true,
        tarea_avances: true,
      },
    });

    return serializeBigInt(rows);
  }

  async findAllForUser(userId: string, cargoId: unknown) {
    if (this.isPrivilegedCargo(cargoId)) {
      return this.findAll();
    }

    const rows = await this.prisma.tareas.findMany({
      where: {
        OR: [{ usuario_asignado: userId }, { asignado_por: userId }],
      },
      orderBy: { fecha_creacion: 'desc' },
      include: {
        tarea_asignaciones: true,
        tarea_avances: true,
      },
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

    const row = await this.prisma.tareas.findUnique({
      where: { id },
      include: {
        tarea_asignaciones: true,
        tarea_avances: true,
      },
    });

    if (!row) throw new NotFoundException('Not found');
    return serializeBigInt(row);
  }

  async findOneForUser(idRaw: string, userId: string, cargoId: unknown) {
    if (this.isPrivilegedCargo(cargoId)) {
      return this.findOne(idRaw);
    }

    let id: bigint;
    try {
      id = parseBigIntId(idRaw);
    } catch {
      throw new BadRequestException('Invalid id');
    }

    const row = await this.prisma.tareas.findFirst({
      where: {
        id,
        OR: [{ usuario_asignado: userId }, { asignado_por: userId }],
      },
      include: {
        tarea_asignaciones: true,
        tarea_avances: true,
      },
    });

    if (!row) throw new NotFoundException('Not found');
    return serializeBigInt(row);
  }

  async crear(asignadoPor: string, dto: CreateTareaDto) {
    const usuarioAsignadoId = await this.resolveUserIdFromIdOrUsername(
      dto.usuario_asignado,
    );

    const legacyCreated = await this.prisma.tareas.create({
      data: {
        titulo: dto.titulo,
        descripcion: dto.descripcion,
        estatus: dto.estatus,
        fecha_limite: dto.fecha_limite ? new Date(dto.fecha_limite) : undefined,
        usuario_asignado: usuarioAsignadoId,
        asignado_por: asignadoPor,
      },
    });

    await this.glpiQueue.enqueueTicket({
      title: `Tarea: ${legacyCreated.titulo}`,
      description: [
        legacyCreated.descripcion
          ? `descripcion: ${legacyCreated.descripcion}`
          : 'descripcion: (sin descripcion)',
        `tarea_id: ${legacyCreated.id.toString()}`,
        `estatus: ${legacyCreated.estatus}`,
        `asignado_por: ${legacyCreated.asignado_por}`,
        `usuario_asignado: ${legacyCreated.usuario_asignado}`,
      ].join('\n'),
      assignedUserId: legacyCreated.usuario_asignado,
      source: { entity: 'tareas', id: legacyCreated.id.toString() },
    });

    return serializeBigInt(legacyCreated);
  }

  async update(idRaw: string, dto: UpdateTareaDto) {
    let id: bigint;
    try {
      id = parseBigIntId(idRaw);
    } catch {
      throw new BadRequestException('Invalid id');
    }

    const usuarioAsignadoId = dto.usuario_asignado
      ? await this.resolveUserIdFromIdOrUsername(dto.usuario_asignado)
      : null;

    const data: Prisma.tareasUpdateInput = {
      titulo: dto.titulo,
      descripcion: dto.descripcion,
      estatus: dto.estatus,
      fecha_limite: dto.fecha_limite ? new Date(dto.fecha_limite) : undefined,
      ...(usuarioAsignadoId
        ? {
            usuarioAsignado: {
              connect: { id: usuarioAsignadoId },
            },
          }
        : null),
    };

    try {
      const updated = await this.prisma.tareas.update({ where: { id }, data });
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
      const deleted = await this.prisma.tareas.delete({ where: { id } });
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

  async comentarLegacy(
    actorUserId: string,
    tareaIdRaw: string,
    mensaje: string,
  ) {
    let tareaId: bigint;
    try {
      tareaId = parseBigIntId(tareaIdRaw);
    } catch {
      throw new BadRequestException('Invalid tareaId');
    }

    const tarea = await this.prisma.tareas.findUnique({
      where: { id: tareaId },
      select: { id: true },
    });
    if (!tarea) throw new NotFoundException('Tarea no encontrada');

    const usuario = await this.prisma.user.findUnique({
      where: { id: actorUserId },
      select: { id: true },
    });
    if (!usuario) {
      throw new BadRequestException(
        `usuario no existe en User.id: ${actorUserId}`,
      );
    }

    const created = await this.prisma.tarea_avances.create({
      data: {
        descripcion: mensaje,
        imagenes: [],
        tareas: { connect: { id: tareaId } },
        User: { connect: { id: actorUserId } },
      } as any,
    });

    return serializeBigInt(created);
  }

  async adjuntarLegacy(
    actorUserId: string,
    tareaIdRaw: string,
    tipo: string,
    nombre: string,
    url: string | null,
  ) {
    let tareaId: bigint;
    try {
      tareaId = parseBigIntId(tareaIdRaw);
    } catch {
      throw new BadRequestException('Invalid tareaId');
    }

    const tarea = await this.prisma.tareas.findUnique({
      where: { id: tareaId },
      select: { id: true },
    });
    if (!tarea) throw new NotFoundException('Tarea no encontrada');

    const usuario = await this.prisma.user.findUnique({
      where: { id: actorUserId },
      select: { id: true },
    });
    if (!usuario) {
      throw new BadRequestException(
        `usuario no existe en User.id: ${actorUserId}`,
      );
    }

    const created = await this.prisma.tarea_avances.create({
      data: {
        descripcion: `[${tipo}] ${nombre}`,
        imagenes: url ? [url] : [],
        tareas: { connect: { id: tareaId } },
        User: { connect: { id: actorUserId } },
      } as any,
    });

    return serializeBigInt(created);
  }

  async actualizarEstadoLegacy(
    actorUserId: string,
    idRaw: string,
    estadoRaw: string,
  ) {
    let id: bigint;
    try {
      id = parseBigIntId(idRaw);
    } catch {
      throw new BadRequestException('Invalid id');
    }

    const estado = this.normalizeEstado(estadoRaw);

    const tarea = await this.prisma.tareas.findUnique({
      where: { id },
      select: { id: true, usuario_asignado: true, asignado_por: true },
    });
    if (!tarea) throw new NotFoundException('Not found');
    if (
      tarea.usuario_asignado !== actorUserId &&
      tarea.asignado_por !== actorUserId
    ) {
      throw new BadRequestException('No autorizado para cambiar estado');
    }

    const updated = await this.prisma.tareas.update({
      where: { id },
      data: { estatus: estado },
    });
    return serializeBigInt(updated);
  }

  async obtenerMisTareas(userId: string) {
    const rows = await this.prisma.tareas.findMany({
      where: { usuario_asignado: userId },
      orderBy: { fecha_creacion: 'desc' },
    });
    return serializeBigInt(rows);
  }
}
