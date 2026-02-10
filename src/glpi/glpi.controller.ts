import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import { GlpiService } from './glpi.service';
import { JwtGuard } from '../auth/guards/jwt.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

@Controller('glpi')
@UseGuards(JwtGuard, RolesGuard)
@Roles('ADMIN')
export class GlpiController {
  constructor(private readonly glpiService: GlpiService) {}

  @Post('tickets')
  crearTicket(@Body() dto: any) {
    return this.glpiService.crearTicket(dto);
  }
}
