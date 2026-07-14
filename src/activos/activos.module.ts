import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { GlpiModule } from '../glpi/glpi.module';
import { ActivosController } from './activos.controller';

@Module({
  imports: [AuthModule, GlpiModule],
  controllers: [ActivosController],
})
export class ActivosModule {}
