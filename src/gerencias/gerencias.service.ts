import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateGerenciaDto } from './dto/create-gerencia.dto';
import { UpdateGerenciaDto } from './dto/update-gerencia.dto';

function parseIntId(idRaw: string): number {
  const parsed = Number(idRaw);
  if (!Number.isInteger(parsed)) throw new BadRequestException('Invalid id');
  return parsed;
}

@Injectable()
export class GerenciasService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.gerencias.findMany({ orderBy: { id: 'asc' } });
  }

  async findOne(idRaw: string) {
    const id = parseIntId(idRaw);
    const row = await this.prisma.gerencias.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Not found');
    return row;
  }

  create(dto: CreateGerenciaDto) {
    return this.prisma.gerencias.create({ data: dto });
  }

  async update(idRaw: string, dto: UpdateGerenciaDto) {
    const id = parseIntId(idRaw);
    try {
      return await this.prisma.gerencias.update({ where: { id }, data: dto });
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
    const id = parseIntId(idRaw);
    try {
      return await this.prisma.gerencias.delete({ where: { id } });
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
