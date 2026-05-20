import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { FuelReportsController } from './fuel-reports.controller';
import { FuelReportsService } from './fuel-reports.service';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [FuelReportsController],
  providers: [FuelReportsService],
})
export class FuelReportsModule {}
