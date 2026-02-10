import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { parseBigIntId, serializeBigInt } from '../common/serialize-bigint';
import { CreateInventarioManttoDto } from './dto/create-inventario-mantto.dto';
import { UpdateInventarioManttoDto } from './dto/update-inventario-mantto.dto';

@Injectable()
export class InventarioManttoService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    const rows = await this.prisma.inventario_mantto.findMany({
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

    const row = await this.prisma.inventario_mantto.findUnique({
      where: { id },
    });
    if (!row) throw new NotFoundException('Not found');
    return serializeBigInt(row);
  }

  async create(dto: CreateInventarioManttoDto) {
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

    const created = await this.prisma.inventario_mantto.create({
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

  async update(idRaw: string, dto: UpdateInventarioManttoDto) {
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
      const updated = await this.prisma.inventario_mantto.update({
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
      const deleted = await this.prisma.inventario_mantto.delete({
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
