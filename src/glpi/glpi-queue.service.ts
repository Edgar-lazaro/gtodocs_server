import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export type GlpiTicketJobPayload = {
  title: string;
  description: string;
  assignedUserId: string;
  requesterUserId?: string;
  source?: {
    entity: string;
    id: string;
  };
};

@Injectable()
export class GlpiQueueService {
  constructor(private readonly prisma: PrismaService) {}

  async enqueueTicket(payload: GlpiTicketJobPayload) {
    return this.prisma.syncQueue.create({
      data: {
        entidad: 'glpi_ticket',
        entidadId: payload.source?.id ?? '',
        accion: 'create',
        payload: payload as any,
        status: 'pending',
        procesado: false,
      },
    });
  }
}
