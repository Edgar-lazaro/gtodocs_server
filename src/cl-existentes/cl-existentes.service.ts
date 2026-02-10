import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { parseBigIntId, serializeBigInt } from '../common/serialize-bigint';
import { CreateClExistenteDto } from './dto/create-cl-existente.dto';
import { UpdateClExistenteDto } from './dto/update-cl-existente.dto';

@Injectable()
export class ClExistentesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(filters?: { jefatura?: string }) {
    let where: { jefatura?: bigint } | undefined = undefined;

    if (filters?.jefatura) {
      try {
        where = { jefatura: parseBigIntId(filters.jefatura) };
      } catch {
        throw new BadRequestException('Invalid jefatura');
      }
    }

    const rows = await this.prisma.cl_existentes.findMany({
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

    const row = await this.prisma.cl_existentes.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Not found');
    return serializeBigInt(row);
  }

  async create(dto: CreateClExistenteDto) {
    const gerencia = await this.prisma.gerencias.findUnique({
      where: { id: dto.gerencia },
      select: { id: true },
    });
    if (!gerencia)
      throw new BadRequestException(`gerencia no existe: ${dto.gerencia}`);

    const jefaturaId = BigInt(dto.jefatura);
    const jefatura = await this.prisma.jefaturas.findUnique({
      where: { id: jefaturaId },
      select: { id: true },
    });
    if (!jefatura)
      throw new BadRequestException(`jefatura no existe: ${dto.jefatura}`);

    const created = await this.prisma.cl_existentes.create({
      data: {
        nombre_cl: dto.nombre_cl,
        funcion_form: dto.funcion_form ?? undefined,
        gerencias: { connect: { id: dto.gerencia } },
        jefaturas: { connect: { id: jefaturaId } },
      } as any,
    });

    return serializeBigInt(created);
  }

  async update(idRaw: string, dto: UpdateClExistenteDto) {
    let id: bigint;
    try {
      id = parseBigIntId(idRaw);
    } catch {
      throw new BadRequestException('Invalid id');
    }

    if (dto.gerencia !== undefined) {
      const gerencia = await this.prisma.gerencias.findUnique({
        where: { id: dto.gerencia },
        select: { id: true },
      });
      if (!gerencia)
        throw new BadRequestException(`gerencia no existe: ${dto.gerencia}`);
    }

    let connectJefatura: any = undefined;
    if (dto.jefatura !== undefined) {
      const jefaturaId = BigInt(dto.jefatura);
      const jefatura = await this.prisma.jefaturas.findUnique({
        where: { id: jefaturaId },
        select: { id: true },
      });
      if (!jefatura)
        throw new BadRequestException(`jefatura no existe: ${dto.jefatura}`);
      connectJefatura = { connect: { id: jefaturaId } };
    }

    const data: any = {
      nombre_cl: dto.nombre_cl,
      funcion_form: dto.funcion_form,
      gerencias:
        dto.gerencia !== undefined
          ? { connect: { id: dto.gerencia } }
          : undefined,
      jefaturas: connectJefatura,
    };

    try {
      const updated = await this.prisma.cl_existentes.update({
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
      const deleted = await this.prisma.cl_existentes.delete({ where: { id } });
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
