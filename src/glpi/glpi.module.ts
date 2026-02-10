import { Module } from '@nestjs/common';
import { GlpiController } from './glpi.controller';
import { GlpiService } from './glpi.service';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { GlpiQueueService } from './glpi-queue.service';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [GlpiController],
  providers: [GlpiService, GlpiQueueService],
  exports: [GlpiQueueService],
})
export class GlpiModule {}
