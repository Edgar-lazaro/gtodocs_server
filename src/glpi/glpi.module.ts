import { Module } from '@nestjs/common';
import { GlpiController } from './glpi.controller';
import { GlpiService } from './glpi.service';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { GlpiQueueService } from './glpi-queue.service';
import { GlpiSyncProcessor } from './glpi-sync.processor';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [GlpiController],
  providers: [GlpiService, GlpiQueueService, GlpiSyncProcessor],
  exports: [GlpiQueueService],
})
export class GlpiModule {}
