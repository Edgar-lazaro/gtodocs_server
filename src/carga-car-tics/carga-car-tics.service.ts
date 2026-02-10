import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { parseBigIntId, serializeBigInt } from '../common/serialize-bigint';
import { CreateCargaCarTicsDto } from './dto/create-carga-car-tics.dto';
import { UpdateCargaCarTicsDto } from './dto/update-carga-car-tics.dto';

@Injectable()
export class CargaCarTicsService {
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
    const rows = await this.prisma.carga_car_tics.findMany({
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

    const row = await this.prisma.carga_car_tics.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Not found');
    return serializeBigInt(row);
  }

  async create(dto: CreateCargaCarTicsDto) {
    const gerenciaId = await this.resolveGerenciaId(
      dto.gerenciaId,
      dto.vehiculo,
    );

    const created = await this.prisma.carga_car_tics.create({
      data: {
        operador: dto.operador,
        km_bf_carga: dto.km_bf_carga,
        foto_km_bf: dto.foto_km_bf,
        km_af_carga: dto.km_af_carga,
        foto_km_af: dto.foto_km_af,
        vehiculo: dto.vehiculo,
        foto_ticket: dto.foto_ticket,
        gerenciaId,
      },
    });

    return serializeBigInt(created);
  }

  /** Crea registro con URLs de imágenes ya guardadas (ej. desde upload) */
  async createFromUpload(
    dto: {
      operador: string;
      km_bf_carga: string;
      km_af_carga: string;
      vehiculo: string;
      gerenciaId?: number;
    },
    urls: { foto_km_bf: string; foto_km_af: string; foto_ticket: string },
  ) {
    const gerenciaId = await this.resolveGerenciaId(
      dto.gerenciaId,
      dto.vehiculo,
    );

    const created = await this.prisma.carga_car_tics.create({
      data: {
        operador: dto.operador,
        km_bf_carga: dto.km_bf_carga,
        foto_km_bf: urls.foto_km_bf,
        km_af_carga: dto.km_af_carga,
        foto_km_af: urls.foto_km_af,
        vehiculo: dto.vehiculo,
        foto_ticket: urls.foto_ticket,
        gerenciaId,
      },
    });

    return serializeBigInt(created);
  }

  async update(idRaw: string, dto: UpdateCargaCarTicsDto) {
    let id: bigint;
    try {
      id = parseBigIntId(idRaw);
    } catch {
      throw new BadRequestException('Invalid id');
    }

    const data: Prisma.carga_car_ticsUpdateInput = {
      ...(dto.operador !== undefined && { operador: dto.operador }),
      ...(dto.km_bf_carga !== undefined && { km_bf_carga: dto.km_bf_carga }),
      ...(dto.foto_km_bf !== undefined && { foto_km_bf: dto.foto_km_bf }),
      ...(dto.km_af_carga !== undefined && { km_af_carga: dto.km_af_carga }),
      ...(dto.foto_km_af !== undefined && { foto_km_af: dto.foto_km_af }),
      ...(dto.vehiculo !== undefined && { vehiculo: dto.vehiculo }),
      ...(dto.foto_ticket !== undefined && { foto_ticket: dto.foto_ticket }),
      ...(dto.gerenciaId !== undefined && { gerenciaId: dto.gerenciaId }),
    };

    try {
      const updated = await this.prisma.carga_car_tics.update({
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
      const deleted = await this.prisma.carga_car_tics.delete({
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
