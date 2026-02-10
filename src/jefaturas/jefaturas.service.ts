import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { parseBigIntId, serializeBigInt } from '../common/serialize-bigint';
import { CreateJefaturaDto } from './dto/create-jefatura.dto';
import { UpdateJefaturaDto } from './dto/update-jefatura.dto';

type AuthUser = {
  sub?: string;
  id?: string;
  gerenciaId?: number | null;
};

@Injectable()
export class JefaturasService {
  constructor(private readonly prisma: PrismaService) {}

  private async resolveUserGerenciaId(user: AuthUser): Promise<number | null> {
    if (user?.gerenciaId !== undefined) return user.gerenciaId ?? null;

    const userId = user?.id ?? user?.sub;
    if (!userId) return null;

    const row = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { gerenciaId: true },
    });

    return row?.gerenciaId ?? null;
  }

  async findAll(user: AuthUser) {
    const gerenciaId = await this.resolveUserGerenciaId(user);
    if (gerenciaId === null) return [];

    const rows = await this.prisma.jefaturas.findMany({
      where: { gerencia: gerenciaId },
      orderBy: { id: 'asc' },
    });
    return serializeBigInt(rows);
  }

  async findOne(idRaw: string, user: AuthUser) {
    let id: bigint;
    try {
      id = parseBigIntId(idRaw);
    } catch {
      throw new BadRequestException('Invalid id');
    }

    const gerenciaId = await this.resolveUserGerenciaId(user);
    if (gerenciaId === null) throw new NotFoundException('Not found');

    const row = await this.prisma.jefaturas.findFirst({
      where: { id, gerencia: gerenciaId },
    });
    if (!row) throw new NotFoundException('Not found');
    return serializeBigInt(row);
  }

  async create(dto: CreateJefaturaDto) {
    const exists = await this.prisma.gerencias.findUnique({
      where: { id: dto.gerencia },
      select: { id: true },
    });
    if (!exists)
      throw new BadRequestException(`gerencia no existe: ${dto.gerencia}`);

    const created = await this.prisma.jefaturas.create({ data: dto });
    return serializeBigInt(created);
  }

  async update(idRaw: string, dto: UpdateJefaturaDto) {
    let id: bigint;
    try {
      id = parseBigIntId(idRaw);
    } catch {
      throw new BadRequestException('Invalid id');
    }

    if (dto.gerencia !== undefined) {
      const exists = await this.prisma.gerencias.findUnique({
        where: { id: dto.gerencia },
        select: { id: true },
      });
      if (!exists)
        throw new BadRequestException(`gerencia no existe: ${dto.gerencia}`);
    }

    try {
      const updated = await this.prisma.jefaturas.update({
        where: { id },
        data: dto,
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
      const deleted = await this.prisma.jefaturas.delete({ where: { id } });
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
