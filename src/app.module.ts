import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule, seconds } from '@nestjs/throttler';

import { HealthModule } from './health/health.module';
import { AuthModule } from './auth/auth.module';
import { GlpiModule } from './glpi/glpi.module';
import { SyncModule } from './sync/sync.module';
import { SecurityModule } from './security/security.module';
import { PrismaModule } from './prisma/prisma.module';
import { TareasModule } from './tareas/tareas.module';
import { DocumentosPdfModule } from './documentos-pdf/documentos-pdf.module';
import { CargosModule } from './cargos/cargos.module';
import { GerenciasModule } from './gerencias/gerencias.module';
import { JefaturasModule } from './jefaturas/jefaturas.module';
import { NotificacionesModule } from './notificaciones/notificaciones.module';
import { InventarioTicsModule } from './inventario-tics/inventario-tics.module';
import { InventarioManttoModule } from './inventario-mantto/inventario-mantto.module';
import { CombustibleModule } from './combustible/combustible.module';
import { TareaAsignacionesModule } from './tarea-asignaciones/tarea-asignaciones.module';
import { TareaAvancesModule } from './tarea-avances/tarea-avances.module';
import { ClExistentesModule } from './cl-existentes/cl-existentes.module';
import { CargaCarTicsModule } from './carga-car-tics/carga-car-tics.module';
import { UsoCarTicsModule } from './uso-car-tics/uso-car-tics.module';
import { VehiculosModule } from './vehiculos/vehiculos.module';
import { CoreSyncQueueModule } from './core-sync-queue/core-sync-queue.module';
import { UsersModule } from './users/users.module';
import { JwtStrategy } from './auth/strategies/jwt.strategy';
import { ReportesModule } from './reportes/reportes.module';
import { ChecklistsModule } from './checklists/checklists.module';
import { FuelReportsModule } from './fuel-reports/fuel-reports.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot([
      {
        // @nestjs/throttler v5+ espera ttl en milisegundos (antes eran
        // segundos). Sin este helper, THROTTLE_TTL_SECONDS=60 se interpreta
        // como 60ms y el rate limit queda 1000x mas corto de lo previsto.
        ttl: seconds(Number(process.env.THROTTLE_TTL_SECONDS ?? 60)),
        limit: Number(process.env.THROTTLE_LIMIT ?? 10),
      },
    ]),
    PrismaModule,
    HealthModule,
    AuthModule,
    GlpiModule,
    SyncModule,
    SecurityModule,
    TareasModule,
    DocumentosPdfModule,
    CargosModule,
    GerenciasModule,
    JefaturasModule,
    NotificacionesModule,
    InventarioTicsModule,
    InventarioManttoModule,
    CombustibleModule,
    TareaAsignacionesModule,
    TareaAvancesModule,
    ClExistentesModule,
    CargaCarTicsModule,
    UsoCarTicsModule,
    VehiculosModule,
    CoreSyncQueueModule,
    UsersModule,
    ReportesModule,
    ChecklistsModule,
    FuelReportsModule,
  ],
  providers: [JwtStrategy],
  controllers: [],
})
export class AppModule {}
