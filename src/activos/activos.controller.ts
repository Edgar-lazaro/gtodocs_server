import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { GlpiService } from '../glpi/glpi.service';
import { JwtGuard } from '../auth/guards/jwt.guard';
import { RegistrarDispositivoDto } from './dto/registrar-dispositivo.dto';

@Controller('activos')
@UseGuards(JwtGuard)
export class ActivosController {
  constructor(private readonly glpiService: GlpiService) {}

  @Post('inventario')
  async registrarInventario(
    @Body() dto: RegistrarDispositivoDto,
    @Req() req: any,
  ) {
    // JwtStrategy.validate() solo expone {id, username, area} en req.user
    // (ver src/auth/strategies/jwt.strategy.ts); glpiUserId se resuelve
    // aparte, igual que en crearFollowup/crearSolucion.
    const username = req.user?.username ?? req.user?.sub;
    const glpiUserId = username
      ? (await this.glpiService.findGlpiUserIdByUsername(username)) ?? undefined
      : undefined;
    return this.glpiService.registrarDispositivoMovil(dto, glpiUserId);
  }
}
