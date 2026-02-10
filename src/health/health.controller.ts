import { Controller, Get } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  check() {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
    };
  }

  @Get('db')
  async db() {
    const [row] = await this.prisma.$queryRaw<
      Array<{
        database: string;
        current_user: string;
        server_addr: string | null;
        server_port: number | null;
      }>
    >`
      select
        current_database() as database,
        current_user as current_user,
        inet_server_addr()::text as server_addr,
        inet_server_port() as server_port
    `;

    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      db: row ?? null,
    };
  }
}
