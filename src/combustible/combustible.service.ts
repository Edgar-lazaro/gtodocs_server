import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { parseBigIntId, serializeBigInt } from '../common/serialize-bigint';
import { CreateCombustibleDto } from './dto/create-combustible.dto';
import { UpdateCombustibleDto } from './dto/update-combustible.dto';

@Injectable()
export class CombustibleService {
  constructor(private readonly prisma: PrismaService) {}

  private parseTimetz(input: unknown, fieldName: string): Date {
    if (input instanceof Date) {
      if (isNaN(input.getTime())) {
        throw new BadRequestException(`${fieldName} inválido`);
      }
      return input;
    }

    const raw = (typeof input === 'string' ? input : '').trim();
    if (!raw) {
      throw new BadRequestException(`${fieldName} es requerido`);
    }

    // Accept full ISO-8601 date times
    const isoCandidate = new Date(raw);
    if (!isNaN(isoCandidate.getTime()) && /[T\-]/.test(raw)) {
      return isoCandidate;
    }

    // Accept time-only strings (HH:mm or HH:mm:ss)
    const m = raw.match(/^([01]?\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/);
    if (!m) {
      throw new BadRequestException(`${fieldName} debe ser ISO-8601 o HH:mm`);
    }
    const hours = Number(m[1]);
    const minutes = Number(m[2]);
    const seconds = m[3] ? Number(m[3]) : 0;

    const d = new Date();
    d.setHours(hours, minutes, seconds, 0);
    return d;
  }

  private normalizeUsoCarTableName(
    input: string | null | undefined,
  ): string | null {
    const t = (input ?? '').trim();
    if (!t) return null;
    // hard allow-list of known per-gerencia usage tables
    const allowed = new Set(['uso_car_tics']);
    return allowed.has(t) ? t : null;
  }

  private resolveUserIdFromPayloadOrBody(
    dto: CreateCombustibleDto,
    userPayload: any,
  ): string {
    const fromBody = (dto.nombre ?? '').trim();
    if (fromBody) return fromBody;

    const payloadId = (userPayload?.id ?? userPayload?.sub ?? '')
      .toString()
      .trim();
    if (!payloadId) {
      throw new BadRequestException(
        'No se pudo resolver el usuario (falta nombre en body y/o JWT inválido)',
      );
    }
    return payloadId;
  }

  private buildUsuarioNombre(user: {
    nombre: string;
    apellido?: string | null;
    username?: string | null;
  }): string {
    const full = `${user.nombre ?? ''} ${user.apellido ?? ''}`
      .replace(/\s+/g, ' ')
      .trim();
    return full || (user.username ?? '').trim() || 'Desconocido';
  }

  async findAll() {
    const rows = await this.prisma.combustible.findMany({
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

    const row = await this.prisma.combustible.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Not found');
    return serializeBigInt(row);
  }

  async create(dto: CreateCombustibleDto, userPayload: any) {
    const userId = this.resolveUserIdFromPayloadOrBody(dto, userPayload);

    const usuario = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        username: true,
        nombre: true,
        apellido: true,
        gerenciaId: true,
        gerencia: { select: { id: true, nombre: true, uso_car: true } },
      },
    });

    if (!usuario) throw new BadRequestException(`Usuario no existe: ${userId}`);

    const usuarioNombre = this.buildUsuarioNombre(usuario);
    const gerenciaId = usuario.gerenciaId ?? null;
    const usoCarRaw = usuario.gerencia?.uso_car ?? null;
    const usoCarTable = this.normalizeUsoCarTableName(usoCarRaw);

    const horaIni = this.parseTimetz(dto.hora_ini, 'hora_ini');
    const horaFinal = this.parseTimetz(dto.hora_final, 'hora_final');

    const created = await this.prisma.$transaction(async (tx) => {
      const combustible = await tx.combustible.create({
        data: {
          hora_ini: horaIni as any,
          hora_final: horaFinal as any,
          km_inicio: new Prisma.Decimal(dto.km_inicio),
          lvl_km_ini: new Prisma.Decimal(dto.lvl_km_ini),
          destino: dto.destino,
          km_final: new Prisma.Decimal(dto.km_final),
          lvl_km_fin: new Prisma.Decimal(dto.lvl_km_fin),
          foto_ini: dto.foto_ini as any,
          foto_fin: dto.foto_fin as any,
          User: { connect: { id: usuario.id } },
        } as any,
      });

      // Verificar alerta de mantenimiento
      const vehiculoInfo = dto.vehiculo
        ? await tx.vehiculos.findUnique({
            where: { nombre_clave: dto.vehiculo },
          })
        : null;
      if (
        vehiculoInfo?.km_ultimo_mantenimiento &&
        vehiculoInfo?.km_mantenimiento_cada
      ) {
        const kmFinal = Number(dto.km_final);
        const kmDesdeManto =
          kmFinal - Number(vehiculoInfo.km_ultimo_mantenimiento);
        if (kmDesdeManto >= Number(vehiculoInfo.km_mantenimiento_cada)) {
          await tx.notificaciones.create({
            data: {
              usuario_id: usuario.id,
              tipo: 'mantenimiento',
              titulo: 'Mantenimiento requerido',
              mensaje: `El vehículo ${vehiculoInfo.marca} ${vehiculoInfo.modelo} (${vehiculoInfo.placas}) ha alcanzado ${kmDesdeManto} km desde su último mantenimiento. Requiere servicio.`,
              leida: false,
            },
          });
        }
      }

      // Per-gerencia record: insert into dynamic table declared in gerencias.uso_car (e.g. uso_car_tics)
      // We only allow known safe table names.
      if (gerenciaId && usoCarTable) {
        // Currently we only support "uso_car_tics" which expects vehiculo NOT NULL.
        if (usoCarTable === 'uso_car_tics') {
          const vehiculo = (dto.vehiculo ?? '').trim();
          if (!vehiculo) {
            throw new BadRequestException(
              'vehiculo es requerido para registrar en uso_car_tics',
            );
          }

          const vehiculoExists = await tx.vehiculos.findUnique({
            where: { nombre_clave: vehiculo },
            select: { nombre_clave: true },
          });
          if (!vehiculoExists) {
            throw new BadRequestException(
              `vehiculo no existe (vehiculos.nombre_clave): ${vehiculo}`,
            );
          }

          // Map combustible payload into uso_car_tics schema (note: columns are TEXT in that table)
          await tx.$executeRawUnsafe(
            `INSERT INTO "${usoCarTable}" (conductor, destino, hora_inicio, nivel_combustible, kilometraje_inicial, hora_final, kilometraje_final, vehiculo)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
            usuarioNombre,
            dto.destino,
            dto.hora_ini,
            dto.lvl_km_ini,
            dto.km_inicio,
            dto.hora_final,
            dto.km_final,
            vehiculo,
          );
        }
      }

      return combustible;
    });

    return serializeBigInt(created);
  }

  async update(idRaw: string, dto: UpdateCombustibleDto) {
    let id: bigint;
    try {
      id = parseBigIntId(idRaw);
    } catch {
      throw new BadRequestException('Invalid id');
    }

    let connectUsuario: any = undefined;
    if (dto.nombre !== undefined) {
      const usuario = await this.prisma.user.findUnique({
        where: { id: dto.nombre },
        select: { id: true },
      });
      if (!usuario)
        throw new BadRequestException(
          `nombre (User.id) no existe: ${dto.nombre}`,
        );
      connectUsuario = { connect: { id: dto.nombre } };
    }

    const data: any = {
      hora_ini:
        dto.hora_ini !== undefined
          ? (this.parseTimetz(dto.hora_ini, 'hora_ini') as any)
          : undefined,
      hora_final:
        dto.hora_final !== undefined
          ? (this.parseTimetz(dto.hora_final, 'hora_final') as any)
          : undefined,
      km_inicio:
        dto.km_inicio !== undefined
          ? new Prisma.Decimal(dto.km_inicio)
          : undefined,
      lvl_km_ini:
        dto.lvl_km_ini !== undefined
          ? new Prisma.Decimal(dto.lvl_km_ini)
          : undefined,
      destino: dto.destino,
      km_final:
        dto.km_final !== undefined
          ? new Prisma.Decimal(dto.km_final)
          : undefined,
      lvl_km_fin:
        dto.lvl_km_fin !== undefined
          ? new Prisma.Decimal(dto.lvl_km_fin)
          : undefined,
      foto_ini: dto.foto_ini !== undefined ? (dto.foto_ini as any) : undefined,
      foto_fin: dto.foto_fin !== undefined ? (dto.foto_fin as any) : undefined,
      User: connectUsuario,
    };

    try {
      const updated = await this.prisma.combustible.update({
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
      const deleted = await this.prisma.combustible.delete({ where: { id } });
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
