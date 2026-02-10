import { Module } from '@nestjs/common';
import { TareasController } from './tareas.controller';
import { TareasService } from './tareas.service';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { GlpiModule } from '../glpi/glpi.module';

@Module({
  imports: [PrismaModule, AuthModule, GlpiModule],
  controllers: [TareasController],
  providers: [TareasService],
})
export class TareasModule {}
