import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { GlpiService } from './glpi.service';

type GlpiTicketJobPayload = {
  title?: string;
  description?: string;
  assignedUserId?: string;
  requesterUserId?: string;
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

  private async findBackendUsernameById(userId?: string): Promise<string | null> {
    const raw = String(userId ?? '').trim();
    if (!raw) return null;

    const user = await this.prisma.user.findUnique({
      where: { id: raw },
      select: { username: true },
    });
    return user?.username?.trim() || null;
  }

  private async findGlpiUserIdByName(username?: string | null): Promise<number | null> {
    const value = String(username ?? '').trim();
    if (!value) return null;

    try {
      const users = await this.glpiService.listUsersByName(value);
      const exact = users.find((user) => {
        const name = String(user?.name ?? '').trim().toLowerCase();
        const alt = String(user?.realname ?? '').trim().toLowerCase();
        const needle = value.toLowerCase();
        return name === needle || alt === needle;
      });

      const match = exact ?? users[0];
      if (!match || match.id == null) return null;

      const id = Number(match.id);
      return Number.isInteger(id) ? id : null;
    } catch (error) {
      this.logger.warn(
        `GLPI user lookup failed for '${value}': ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return null;
    }
  }

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

  private async buildTicketInput(payload: GlpiTicketJobPayload) {
    const [requesterUsername, assignedUsername] = await Promise.all([
      this.findBackendUsernameById(payload.requesterUserId),
      this.findBackendUsernameById(payload.assignedUserId),
    ]);

    const [requesterGlpiId, assignedGlpiId] = await Promise.all([
      this.findGlpiUserIdByName(requesterUsername),
      this.findGlpiUserIdByName(assignedUsername),
    ]);

    const input: Record<string, unknown> = {
      name: payload.title?.trim() || 'Ticket generado desde GTO Docs',
      content: payload.description?.trim() || 'Sin descripcion',
    };

    if (requesterGlpiId) {
      input._users_id_requester = requesterGlpiId;
    }
    if (assignedGlpiId) {
      input._users_id_assign = assignedGlpiId;
    }

    return {
      input,
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
          const ticketInput = await this.buildTicketInput(payload);
          const response = await this.glpiService.crearTicket(
            ticketInput,
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
