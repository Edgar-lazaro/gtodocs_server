import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { parseBigIntId, serializeBigInt } from '../common/serialize-bigint';
import { CreateUsoCarTicsDto } from './dto/create-uso-car-tics.dto';
import { UpdateUsoCarTicsDto } from './dto/update-uso-car-tics.dto';

@Injectable()
export class UsoCarTicsService {
  constructor(private readonly prisma: PrismaService) {}

  private async resolveGerenciaId(
    gerenciaId?: number,
    vehiculoNombreClave?: string,
  ): Promise<number | undefined> {
    if (gerenciaId != null && gerenciaId > 0) return gerenciaId;
    if (!vehiculoNombreClave) return undefined;

    const v = await this.prisma.vehiculos.findUnique({
      where: { nombre_clave: vehiculoNombreClave },
      select: { gerencia: true },
    });
    if (!v?.gerencia) return undefined;

    const g = await this.prisma.gerencias.findUnique({
      where: { nombre: v.gerencia },
      select: { id: true },
    });
    return g?.id ?? undefined;
  }

  async findAll(gerenciaId?: number) {
    const where = gerenciaId != null ? { gerenciaId } : {};
    const rows = await this.prisma.uso_car_tics.findMany({
      where,
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

    const row = await this.prisma.uso_car_tics.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Not found');
    return serializeBigInt(row);
  }

  async create(dto: CreateUsoCarTicsDto) {
    const gerenciaId = await this.resolveGerenciaId(
      dto.gerenciaId,
      dto.vehiculo,
    );

    const created = await this.prisma.uso_car_tics.create({
      data: {
        vehiculo: dto.vehiculo,
        conductor: dto.conductor,
        destino: dto.destino,
        hora_inicio: dto.hora_inicio,
        nivel_combustible: dto.nivel_combustible,
        kilometraje_inicial: dto.kilometraje_inicial,
        foto_km_inicial: dto.foto_km_inicial ?? undefined,
        hora_final: dto.hora_final,
        kilometraje_final: dto.kilometraje_final,
        foto_km_final: dto.foto_km_final ?? undefined,
        gerenciaId,
      },
    });

    return serializeBigInt(created);
  }

  /** Crea registro con URLs de imágenes ya guardadas (ej. desde upload) */
  async createFromUpload(
    dto: Omit<CreateUsoCarTicsDto, 'foto_km_inicial' | 'foto_km_final'>,
    urls: { foto_km_inicial: string; foto_km_final: string },
  ) {
    const gerenciaId = await this.resolveGerenciaId(
      dto.gerenciaId,
      dto.vehiculo,
    );

    const created = await this.prisma.uso_car_tics.create({
      data: {
        vehiculo: dto.vehiculo,
        conductor: dto.conductor,
        destino: dto.destino,
        hora_inicio: dto.hora_inicio,
        nivel_combustible: dto.nivel_combustible,
        kilometraje_inicial: dto.kilometraje_inicial,
        foto_km_inicial: urls.foto_km_inicial,
        hora_final: dto.hora_final,
        kilometraje_final: dto.kilometraje_final,
        foto_km_final: urls.foto_km_final,
        gerenciaId,
      },
    });

    return serializeBigInt(created);
  }

  async update(idRaw: string, dto: UpdateUsoCarTicsDto) {
    let id: bigint;
    try {
      id = parseBigIntId(idRaw);
    } catch {
      throw new BadRequestException('Invalid id');
    }

    const data: Prisma.uso_car_ticsUpdateInput = {
      ...(dto.vehiculo !== undefined && { vehiculo: dto.vehiculo }),
      ...(dto.conductor !== undefined && { conductor: dto.conductor }),
      ...(dto.destino !== undefined && { destino: dto.destino }),
      ...(dto.hora_inicio !== undefined && { hora_inicio: dto.hora_inicio }),
      ...(dto.nivel_combustible !== undefined && {
        nivel_combustible: dto.nivel_combustible,
      }),
      ...(dto.kilometraje_inicial !== undefined && {
        kilometraje_inicial: dto.kilometraje_inicial,
      }),
      ...(dto.foto_km_inicial !== undefined && {
        foto_km_inicial: dto.foto_km_inicial,
      }),
      ...(dto.hora_final !== undefined && { hora_final: dto.hora_final }),
      ...(dto.kilometraje_final !== undefined && {
        kilometraje_final: dto.kilometraje_final,
      }),
      ...(dto.foto_km_final !== undefined && {
        foto_km_final: dto.foto_km_final,
      }),
      ...(dto.gerenciaId !== undefined && { gerenciaId: dto.gerenciaId }),
    };

    try {
      const updated = await this.prisma.uso_car_tics.update({
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
      const deleted = await this.prisma.uso_car_tics.delete({ where: { id } });
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
