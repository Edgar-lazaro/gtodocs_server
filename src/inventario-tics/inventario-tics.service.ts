import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { parseBigIntId, serializeBigInt } from '../common/serialize-bigint';
import { CreateInventarioTicsDto } from './dto/create-inventario-tics.dto';
import { UpdateInventarioTicsDto } from './dto/update-inventario-tics.dto';

function parseOptionalIntId(iRaw: string | undefined): number | undefined {
  if (iRaw === undefined) return undefined;
  const parsed = Number(iRaw);
  if (!Number.isInteger(parsed))
    throw new BadRequestException('Invalid gerencia');
  return parsed;
}

@Injectable()
export class InventarioTicsService {
  constructor(private readonly prisma: PrismaService) {}

  private async resolveInventarioTableFromGerencia(
    gerenciaId: number,
  ): Promise<string | null> {
    const row = await this.prisma.gerencias.findUnique({
      where: { id: gerenciaId },
      select: { tabla_inventario: true },
    });

    if (!row)
      throw new BadRequestException(`gerencia no existe: ${gerenciaId}`);

    const table = row.tabla_inventario?.trim();
    if (!table) return null;

    if (!/^(inv|inventario)_[a-zA-Z0-9_]+$/.test(table)) {
      throw new BadRequestException('tabla_inventario inválida');
    }
    const exists = await this.prisma.$queryRaw<[{ exists: boolean }]>(
      Prisma.sql`
        select exists(
          select 1
          from information_schema.tables
          where table_schema = 'public'
            and table_name = ${table}
        ) as "exists"
      `,
    );

    if (!exists?.[0]?.exists) {
      throw new BadRequestException(`tabla_inventario no existe: ${table}`);
    }

    return table;
  }

  async findAll(filters?: { gerencia?: string }) {
    const gerenciaId = parseOptionalIntId(filters?.gerencia);

    if (gerenciaId !== undefined) {
      const table = await this.resolveInventarioTableFromGerencia(gerenciaId);
      if (table) {
        const rows = await this.prisma.$queryRaw<any[]>(
          Prisma.sql`select * from ${Prisma.raw(`"${table}"`)} order by id desc`,
        );
        return serializeBigInt(rows);
      }
    }

    const rows = await this.prisma.inventario_tics.findMany({
      orderBy: { id: 'desc' },
    });
    return serializeBigInt(rows);
  }

  async findOne(idRaw: string, filters?: { gerencia?: string }) {
    let id: bigint;
    try {
      id = parseBigIntId(idRaw);
    } catch {
      throw new BadRequestException('Invalid id');
    }

    const gerenciaId = parseOptionalIntId(filters?.gerencia);

    if (gerenciaId !== undefined) {
      const table = await this.resolveInventarioTableFromGerencia(gerenciaId);
      if (table) {
        const rows = await this.prisma.$queryRaw<any[]>(
          Prisma.sql`select * from ${Prisma.raw(`"${table}"`)} where id = ${id} limit 1`,
        );
        const row = rows?.[0];
        if (!row) throw new NotFoundException('Not found');
        return serializeBigInt(row);
      }
    }

    const row = await this.prisma.inventario_tics.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Not found');
    return serializeBigInt(row);
  }

  async create(dto: CreateInventarioTicsDto) {
    if (dto.gerencia !== undefined) {
      const g = await this.prisma.gerencias.findUnique({
        where: { id: dto.gerencia },
        select: { id: true },
      });
      if (!g)
        throw new BadRequestException(`gerencia no existe: ${dto.gerencia}`);
    }
    if (dto.jefatura !== undefined) {
      const jid = BigInt(dto.jefatura);
      const j = await this.prisma.jefaturas.findUnique({
        where: { id: jid },
        select: { id: true },
      });
      if (!j)
        throw new BadRequestException(`jefatura no existe: ${dto.jefatura}`);
    }

    const created = await this.prisma.inventario_tics.create({
      data: {
        nombre: dto.nombre,
        descripcion: dto.descripcion,
        cantidad: dto.cantidad,
        precio: dto.precio ? new Prisma.Decimal(dto.precio) : undefined,
        categoria: dto.categoria,
        estado: dto.estado,
        ubicacion: dto.ubicacion,
        img: dto.img,
        gerencias:
          dto.gerencia !== undefined
            ? { connect: { id: dto.gerencia } }
            : undefined,
        jefaturas:
          dto.jefatura !== undefined
            ? { connect: { id: BigInt(dto.jefatura) } }
            : undefined,
      },
    });

    return serializeBigInt(created);
  }

  async update(idRaw: string, dto: UpdateInventarioTicsDto) {
    let id: bigint;
    try {
      id = parseBigIntId(idRaw);
    } catch {
      throw new BadRequestException('Invalid id');
    }

    if (dto.gerencia !== undefined) {
      const g = await this.prisma.gerencias.findUnique({
        where: { id: dto.gerencia },
        select: { id: true },
      });
      if (!g)
        throw new BadRequestException(`gerencia no existe: ${dto.gerencia}`);
    }
    if (dto.jefatura !== undefined) {
      const jid = BigInt(dto.jefatura);
      const j = await this.prisma.jefaturas.findUnique({
        where: { id: jid },
        select: { id: true },
      });
      if (!j)
        throw new BadRequestException(`jefatura no existe: ${dto.jefatura}`);
    }

    const data: any = {
      nombre: dto.nombre,
      descripcion: dto.descripcion,
      cantidad: dto.cantidad,
      precio: dto.precio ? new Prisma.Decimal(dto.precio) : undefined,
      categoria: dto.categoria,
      estado: dto.estado,
      ubicacion: dto.ubicacion,
      img: dto.img,
      gerencias:
        dto.gerencia !== undefined
          ? { connect: { id: dto.gerencia } }
          : undefined,
      jefaturas:
        dto.jefatura !== undefined
          ? { connect: { id: BigInt(dto.jefatura) } }
          : undefined,
    };

    try {
      const updated = await this.prisma.inventario_tics.update({
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
      const deleted = await this.prisma.inventario_tics.delete({
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
