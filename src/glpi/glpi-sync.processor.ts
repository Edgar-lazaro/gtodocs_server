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

type GlpiFollowupJobPayload = {
  ticketId: number;
  content: string;
  userId?: string;
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
    if (user?.username?.trim()) return user.username.trim();

    // Si no es un UUID de app, puede ser un username de GLPI guardado directamente
    return raw;
  }

  private async findGlpiUserIdByName(username?: string | null): Promise<number | null> {
    const value = String(username ?? '').trim().toLowerCase();
    if (!value) return null;

    try {
      const users = await this.glpiService.listUsers();
      const exact = users.find((user) => {
        const name = String(user?.name ?? '').trim().toLowerCase();
        const alt = String(user?.realname ?? '').trim().toLowerCase();
        return name === value || alt === value;
      });

      if (!exact || exact.id == null) return null;

      const id = Number(exact.id);
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

    this.logger.log(`Sync processor starting with interval ${intervalMs}ms`);
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
      name: payload.title?.trim() || 'Ticket generado desde GTODocs',
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
      this.logger.log('Processing pending jobs...');
      const batchSize = Number(process.env.GLPI_SYNC_BATCH_SIZE ?? 5);
      const jobs = await this.prisma.syncQueue.findMany({
        where: {
          entidad: { in: ['glpi_ticket', 'glpi_followup'] },
          status: 'pending',
          procesado: false,
          lockedAt: null,
          OR: [{ nextRunAt: null }, { nextRunAt: { lte: new Date() } }],
        },
        orderBy: { createdAt: 'asc' },
        take: Number.isFinite(batchSize) && batchSize > 0 ? batchSize : 5,
      });

      this.logger.log(`Found ${jobs.length} pending jobs`);
      for (const job of jobs) {
        this.logger.log(`Processing job ${job.id} (${job.entidad})`);
        const locked = await this.prisma.syncQueue.updateMany({
          where: { id: job.id, lockedAt: null, procesado: false, status: 'pending' },
          data: { lockedAt: new Date() },
        });
        if (locked.count === 0) {
          this.logger.warn(`Job ${job.id} could not be locked, skipping`);
          continue;
        }

        if (job.entidad === 'glpi_ticket') {
          await this.processTicketJob(job);
        } else if (job.entidad === 'glpi_followup') {
          await this.processFollowupJob(job);
        } else {
          await this.prisma.syncQueue.update({
            where: { id: job.id },
            data: { status: 'error', lockedAt: null, lastError: 'Unknown entity' },
          });
        }
      }
    } catch (error) {
      this.logger.error(`processPendingJobs error: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      this.running = false;
    }
  }

  private async processTicketJob(job: any) {
    const payload = (job.payload ?? {}) as GlpiTicketJobPayload;

    try {
      const ticketInput = await this.buildTicketInput(payload);
      const response = await this.glpiService.crearTicket(ticketInput);
      const responseData = response?.data;
      const ticketId =
        responseData && typeof responseData === 'object' && 'id' in responseData
          ? String((responseData as { id: unknown }).id)
          : null;

      if (ticketId) {
        await this.prisma.tareas.updateMany({
          where: { id: BigInt(payload.source?.id ?? '0') },
          data: { glpi_ticket_id: Number(ticketId) },
        });
      }

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
        `GLPI ticket sync failed for job ${job.id} (retry ${retries}/${maxRetries}): ${message}`,
      );
    }
  }

  private async processFollowupJob(job: any) {
    const payload = (job.payload ?? {}) as GlpiFollowupJobPayload;

    try {
      this.logger.log(`Processing followup job ${job.id} for ticket ${payload.ticketId}`);
      const username = await this.findBackendUsernameById(payload.userId);
      this.logger.log(`Followup username: ${username}`);
      const glpiUserId = username ? await this.findGlpiUserIdByName(username) : null;
      this.logger.log(`GLPI user ID: ${glpiUserId}`);
      await this.glpiService.crearFollowup(
        payload.ticketId,
        payload.content,
        glpiUserId ?? undefined,
      );
      await this.prisma.syncQueue.update({
        where: { id: job.id },
        data: {
          status: 'completed',
          procesado: true,
          processedAt: new Date(),
          lockedAt: null,
          lastError: null,
        },
      });
      this.logger.log(`Followup job ${job.id} completed successfully`);
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
        `GLPI followup sync failed for job ${job.id} (retry ${retries}/${maxRetries}): ${message}`,
      );
    }
  }
}
