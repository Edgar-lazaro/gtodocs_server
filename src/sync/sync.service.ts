import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class SyncService {
  constructor(private prisma: PrismaService) {}

  async procesar(payload: any[], userId: string) {
    if (!userId) {
      throw new BadRequestException('Usuario no identificado (token inválido)');
    }

    try {
      await this.prisma.$transaction(async (tx) => {
        for (const item of payload) {
          if (!item || typeof item !== 'object') {
            throw new BadRequestException('Item inválido en payload');
          }
          if (!item.entidad || !item.payload) {
            throw new BadRequestException(
              'Cada item debe incluir entidad y payload',
            );
          }

          const entidadId =
            typeof item.entidadId === 'string' ? item.entidadId : '';
          const accion =
            typeof item.accion === 'string' ? item.accion : 'upsert';

          await tx.syncQueue.create({
            data: {
              entidad: String(item.entidad),
              entidadId,
              accion,
              payload: item.payload,
              status: 'pending',
              procesado: false,
            },
          });
        }
      });

      return { ok: true, queued: payload.length };
    } catch (e) {
      if (e instanceof BadRequestException) {
        throw e;
      }
      if (e instanceof Prisma.PrismaClientKnownRequestError) {
        throw new BadRequestException({ code: e.code, meta: e.meta });
      }
      throw e;
    }
  }
}
