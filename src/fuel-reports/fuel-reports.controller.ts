import {
  Controller,
  Get,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { JwtGuard } from '../auth/guards/jwt.guard';
import { FuelReportsService } from './fuel-reports.service';
import { FuelReportQueryDto } from './dto/fuel-report-query.dto';

@Controller('fuel-reports')
@UseGuards(JwtGuard)
export class FuelReportsController {
  constructor(private readonly service: FuelReportsService) {}

  @Post('generate')
  async generate(@Query() query: FuelReportQueryDto, @Req() req: Request) {
    const userId = (req as any).user?.sub ?? (req as any).user?.id;
    const result = await this.service.generateReport(
      {
        gerenciaId: query.gerenciaId,
        vehiculo: query.vehiculo,
        startDate: query.startDate,
        endDate: query.endDate,
        tipo: query.tipo,
      },
      userId,
    );

    return {
      filename: result.filename,
      url: `/uploads/documentos/reportes/pdfs/combustible/${result.filename}`,
    };
  }

  @Get('preview')
  async preview(
    @Query() query: FuelReportQueryDto,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const userId = (req as any).user?.sub ?? (req as any).user?.id;
    const result = await this.service.generateReport(
      {
        gerenciaId: query.gerenciaId,
        vehiculo: query.vehiculo,
        startDate: query.startDate,
        endDate: query.endDate,
        tipo: query.tipo,
      },
      userId,
    );

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `inline; filename="${result.filename}"`,
    );
    const fs = await import('fs');
    const stream = fs.createReadStream(result.filePath);
    stream.pipe(res);
  }
}
