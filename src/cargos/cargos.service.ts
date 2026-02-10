import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCargoDto } from './dto/create-cargo.dto';
import { UpdateCargoDto } from './dto/update-cargo.dto';

function parseIntId(idRaw: string): number {
  const parsed = Number(idRaw);
  if (!Number.isInteger(parsed)) throw new BadRequestException('Invalid id');
  return parsed;
}

@Injectable()
export class CargosService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.cargos.findMany({ orderBy: { id: 'asc' } });
  }

  async findOne(idRaw: string) {
    const id = parseIntId(idRaw);
    const row = await this.prisma.cargos.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Not found');
    return row;
  }

  create(dto: CreateCargoDto) {
    return this.prisma.cargos.create({ data: dto });
  }

  async update(idRaw: string, dto: UpdateCargoDto) {
    const id = parseIntId(idRaw);
    try {
      return await this.prisma.cargos.update({ where: { id }, data: dto });
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
      return await this.prisma.cargos.delete({ where: { id } });
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
