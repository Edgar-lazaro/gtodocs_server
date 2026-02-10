import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtGuard } from '../auth/guards/jwt.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { InventarioTicsService } from './inventario-tics.service';
import { CreateInventarioTicsDto } from './dto/create-inventario-tics.dto';
import { UpdateInventarioTicsDto } from './dto/update-inventario-tics.dto';

@Controller('inventario-tics')
@UseGuards(JwtGuard, RolesGuard)
export class InventarioTicsController {
  constructor(private readonly service: InventarioTicsService) {}

  @Get()
  findAll(
    @Query('gerencia') gerencia?: string,
    @Query('gerencia_id') gerencia_id?: string,
    @Query('gerenciaId') gerenciaId?: string,
  ) {
    return this.service.findAll({
      gerencia: gerencia ?? gerencia_id ?? gerenciaId,
    });
  }

  @Get(':id')
  findOne(
    @Param('id') id: string,
    @Query('gerencia') gerencia?: string,
    @Query('gerencia_id') gerencia_id?: string,
    @Query('gerenciaId') gerenciaId?: string,
  ) {
    return this.service.findOne(id, {
      gerencia: gerencia ?? gerencia_id ?? gerenciaId,
    });
  }

  @Post()
  @Roles('ADMIN')
  create(@Body() dto: CreateInventarioTicsDto) {
    return this.service.create(dto);
  }

  @Patch(':id')
  @Roles('ADMIN')
  update(@Param('id') id: string, @Body() dto: UpdateInventarioTicsDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @Roles('ADMIN')
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
