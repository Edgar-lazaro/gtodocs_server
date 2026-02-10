import {
  BadRequestException,
  Controller,
  Post,
  Body,
  Req,
  UseGuards,
} from '@nestjs/common';
import { SyncService } from './sync.service';
import { JwtGuard } from '../auth/guards/jwt.guard';

@Controller('sync')
@UseGuards(JwtGuard)
export class SyncController {
  constructor(private readonly syncService: SyncService) {}

  @Post()
  process(@Req() req, @Body() payload: any) {
    if (!Array.isArray(payload)) {
      throw new BadRequestException('El body debe ser un arreglo de items');
    }

    const userId = req.user?.sub ?? req.user?.id;
    return this.syncService.procesar(payload, userId);
  }
}
