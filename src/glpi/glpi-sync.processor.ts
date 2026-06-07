import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { GlpiService } from './glpi.service';

type GlpiTicketJobPayload = {
  title?: string;
  description?: string;
  assignedUserId?: string;
  source?: {
    entity?: string;
    id?: string;
  };
};

@Injectable()
export class GlpiSyncProcessor implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(GlpiSyncProcessor.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly glpiService: GlpiService,
  ) {}

  onModuleInit() {
    const intervalMs = Number(process.env.GLPI_SYNC_INTERVAL_MS ?? 5000);
    if (!Number.isFinite(intervalMs) || intervalMs <= 0) {
      this.logger.warn('GLPI sync processor disabled: invalid GLPI_SYNC_INTERVAL_MS');
      return;
    }

    this.timer = setInterval(() => {
      void this.processPendingJobs();
    }, intervalMs);
    this.timer.unref?.();
    void this.processPendingJobs();
  }

  onModuleDestroy() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private buildTicketInput(payload: GlpiTicketJobPayload) {
    return {
      input: {
        name: payload.title?.trim() || 'Ticket generado desde GTO Docs',
        content: payload.description?.trim() || 'Sin descripcion',
      },
    };
  }

  private async processPendingJobs() {
    if (this.running) return;
    this.running = true;

    try {
      const batchSize = Number(process.env.GLPI_SYNC_BATCH_SIZE ?? 5);
      const jobs = await this.prisma.syncQueue.findMany({
        where: {
          entidad: 'glpi_ticket',
          status: 'pending',
          procesado: false,
          lockedAt: null,
          OR: [{ nextRunAt: null }, { nextRunAt: { lte: new Date() } }],
        },
        orderBy: { createdAt: 'asc' },
        take: Number.isFinite(batchSize) && batchSize > 0 ? batchSize : 5,
      });

      for (const job of jobs) {
        const locked = await this.prisma.syncQueue.updateMany({
          where: { id: job.id, lockedAt: null, procesado: false, status: 'pending' },
          data: { lockedAt: new Date() },
        });
        if (locked.count === 0) continue;

        const payload = (job.payload ?? {}) as GlpiTicketJobPayload;

        try {
          const response = await this.glpiService.crearTicket(
            this.buildTicketInput(payload),
          );
          const responseData = response?.data;
          const ticketId =
            responseData && typeof responseData === 'object' && 'id' in responseData
              ? String((responseData as { id: unknown }).id)
              : null;

          await this.prisma.syncQueue.update({
            where: { id: job.id },
            data: {
              status: 'completed',
              procesado: true,
              processedAt: new Date(),
              lockedAt: null,
              lastError: null,
              entidadId: ticketId ?? job.entidadId,
            },
          });
        } catch (error) {
          const retries = job.retries + 1;
          const maxRetries = job.maxRetries > 0 ? job.maxRetries : 20;
          const exhausted = retries >= maxRetries;
          const message = error instanceof Error ? error.message : String(error);

          await this.prisma.syncQueue.update({
            where: { id: job.id },
            data: {
              retries,
              lockedAt: null,
              lastError: message,
              status: exhausted ? 'error' : 'pending',
              nextRunAt: exhausted ? null : new Date(Date.now() + retries * 60_000),
            },
          });

          this.logger.warn(
            `GLPI sync failed for job ${job.id} (retry ${retries}/${maxRetries}): ${message}`,
          );
        }
      }
    } finally {
      this.running = false;
    }
  }
}
