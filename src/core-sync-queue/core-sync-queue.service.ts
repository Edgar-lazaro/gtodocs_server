import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCoreSyncQueueDto } from './dto/create-core-sync-queue.dto';
import { UpdateCoreSyncQueueDto } from './dto/update-core-sync-queue.dto';

function parseIntId(idRaw: string): number {
  const parsed = Number(idRaw);
  if (!Number.isInteger(parsed)) throw new BadRequestException('Invalid id');
  return parsed;
}

@Injectable()
export class CoreSyncQueueService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.syncQueue.findMany({ orderBy: { createdAt: 'desc' } });
  }

  async findOne(idRaw: string) {
    const id = parseIntId(idRaw);
    const row = await this.prisma.syncQueue.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Not found');
    return row;
  }

  create(dto: CreateCoreSyncQueueDto) {
    return this.prisma.syncQueue.create({ data: dto as any });
  }

  async update(idRaw: string, dto: UpdateCoreSyncQueueDto) {
    const id = parseIntId(idRaw);
    try {
      return await this.prisma.syncQueue.update({
        where: { id },
        data: dto as any,
      });
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
      return await this.prisma.syncQueue.delete({ where: { id } });
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
