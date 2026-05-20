import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import PDFDocument from 'pdfkit';
import * as path from 'path';
import * as fs from 'fs';
import { resolveUploadsRoot } from '../uploads/uploads.util';

export interface FuelReportFilters {
  gerenciaId?: number;
  vehiculo?: string;
  startDate?: string;
  endDate?: string;
  tipo?: 'combustible' | 'carga' | 'todos';
}

@Injectable()
export class FuelReportsService {
  private readonly logger = new Logger(FuelReportsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async generateReport(filters: FuelReportFilters, userId: string) {
    const usuario = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { nombre: true, apellido: true },
    });

    const userDisplay = usuario
      ? `${usuario.nombre} ${usuario.apellido ?? ''}`.trim()
      : 'Desconocido';

    const start = filters.startDate
      ? new Date(filters.startDate)
      : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const end = filters.endDate ? new Date(filters.endDate) : new Date();

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      throw new BadRequestException('Fechas inválidas');
    }

    const whereCombustible: any = {
      created_at: { gte: start, lte: end },
    };
    const whereCarga: any = {
      created_at: { gte: start, lte: end },
    };
    const whereUso: any = {
      created_at: { gte: start, lte: end },
    };

    if (filters.gerenciaId) {
      const vehiculosDeGerencia = await this.prisma.vehiculos.findMany({
        where: { gerenciaRef: { id: filters.gerenciaId } },
        select: { nombre_clave: true },
      });
      const claves = vehiculosDeGerencia.map((v) => v.nombre_clave);
      whereCombustible.User = { gerenciaId: filters.gerenciaId };
      whereUso.vehiculo = { in: claves };
      whereCarga.vehiculo = { in: claves };
    }

    if (filters.vehiculo) {
      const claves = filters.vehiculo.split(',').map((v) => v.trim());
      whereCombustible.User = {
        ...whereCombustible.User,
      };
      whereUso.vehiculo = { in: claves };
      whereCarga.vehiculo = { in: claves };
    }

    const [combustibles, cargas, usos, gerencias, vehiculos] =
      await Promise.all([
        this.prisma.combustible.findMany({
          where: whereCombustible,
          include: {
            User: {
              select: {
                nombre: true,
                apellido: true,
                gerencia: { select: { nombre: true } },
              },
            },
          },
          orderBy: { created_at: 'asc' },
        }),
        this.prisma.carga_car_tics.findMany({
          where: whereCarga,
          include: {
            vehiculoRef: {
              select: { marca: true, modelo: true, placas: true },
            },
          },
          orderBy: { created_at: 'asc' },
        }),
        this.prisma.uso_car_tics.findMany({
          where: whereUso,
          include: {
            vehiculoRef: {
              select: { marca: true, modelo: true, placas: true },
            },
          },
          orderBy: { created_at: 'asc' },
        }),
        this.prisma.gerencias.findMany({ orderBy: { nombre: 'asc' } }),
        this.prisma.vehiculos.findMany({
          orderBy: { gerencia: 'asc' },
        }),
      ]);

    if (combustibles.length === 0 && cargas.length === 0 && usos.length === 0) {
      throw new BadRequestException(
        'No hay datos de combustible en el período seleccionado',
      );
    }

    const filename = `reporte-combustible_${start.toISOString().slice(0, 10)}_${end.toISOString().slice(0, 10)}_${Date.now()}.pdf`;

    const uploadsRoot = resolveUploadsRoot();
    const reportsDir = path.join(
      uploadsRoot,
      'documentos',
      'reportes',
      'pdfs',
      'combustible',
    );
    fs.mkdirSync(reportsDir, { recursive: true });

    const filePath = path.join(reportsDir, filename);
    const doc = new PDFDocument({
      size: 'A4',
      margins: { top: 40, bottom: 40, left: 40, right: 40 },
      info: {
        Title: 'Reporte de Combustible',
        Author: userDisplay,
        Subject: `Período: ${start.toLocaleDateString()} - ${end.toLocaleDateString()}`,
      },
    });

    const writeStream = fs.createWriteStream(filePath);
    doc.pipe(writeStream);

    this.buildPdfContent(doc, {
      start,
      end,
      userDisplay,
      gerencias,
      vehiculos,
      combustibles,
      cargas,
      usos,
      filters,
    });

    doc.end();

    return new Promise<{ filename: string; filePath: string }>(
      (resolve, reject) => {
        writeStream.on('finish', () => {
          resolve({
            filename,
            filePath,
          });
        });
        writeStream.on('error', reject);
      },
    );
  }

  private buildPdfContent(
    doc: PDFKit.PDFDocument,
    data: {
      start: Date;
      end: Date;
      userDisplay: string;
      gerencias: any[];
      vehiculos: any[];
      combustibles: any[];
      cargas: any[];
      usos: any[];
      filters: FuelReportFilters;
    },
  ) {
    const {
      start,
      end,
      userDisplay,
      gerencias,
      vehiculos,
      combustibles,
      cargas,
      usos,
    } = data;

    const drawHeader = () => {
      doc.fontSize(16).font('Helvetica-Bold');
      doc.text('Reporte de Consumo de Combustible', { align: 'center' });
      doc.moveDown(0.3);
      doc.fontSize(10).font('Helvetica');
      doc.text(
        `Período: ${start.toLocaleDateString('es-MX')} - ${end.toLocaleDateString('es-MX')}`,
        { align: 'center' },
      );
      doc.text(
        `Generado por: ${userDisplay} | ${new Date().toLocaleString('es-MX')}`,
        {
          align: 'center',
        },
      );
      doc.moveDown(0.5);
    };

    const drawTableHeader = (headers: string[], colWidths: number[]) => {
      doc.fontSize(8).font('Helvetica-Bold');
      let x = doc.page.margins.left;
      headers.forEach((h, i) => {
        doc.text(h, x, doc.y, { width: colWidths[i], align: 'left' });
        x += colWidths[i];
      });
      doc.moveDown(0.3);
    };

    const drawTableRow = (
      values: string[],
      colWidths: number[],
      fontSize = 7,
    ) => {
      const y = doc.y;
      doc.fontSize(fontSize).font('Helvetica');
      let x = doc.page.margins.left;
      values.forEach((v, i) => {
        doc.text(v, x, y, { width: colWidths[i], align: 'left' });
        x += colWidths[i];
      });
      doc.moveDown(0.2);
    };

    const checkPage = (needed: number) => {
      if (doc.y + needed > doc.page.height - doc.page.margins.bottom) {
        doc.addPage();
        return true;
      }
      return false;
    };

    drawHeader();

    const vehiculosPorGerencia: Record<string, any[]> = {};
    for (const v of vehiculos) {
      const g = v.gerencia || 'Sin gerencia';
      if (!vehiculosPorGerencia[g]) vehiculosPorGerencia[g] = [];
      vehiculosPorGerencia[g].push(v);
    }

    const combustiblesPorUser: Record<string, any[]> = {};
    for (const c of combustibles) {
      const key = c.nombre;
      if (!combustiblesPorUser[key]) combustiblesPorUser[key] = [];
      combustiblesPorUser[key].push(c);
    }

    const cargasPorVehiculo: Record<string, any[]> = {};
    for (const c of cargas) {
      if (!cargasPorVehiculo[c.vehiculo]) cargasPorVehiculo[c.vehiculo] = [];
      cargasPorVehiculo[c.vehiculo].push(c);
    }

    const usosPorVehiculo: Record<string, any[]> = {};
    for (const u of usos) {
      if (!usosPorVehiculo[u.vehiculo]) usosPorVehiculo[u.vehiculo] = [];
      usosPorVehiculo[u.vehiculo].push(u);
    }

    for (const gerencia of gerencias) {
      checkPage(60);
      doc.fontSize(12).font('Helvetica-Bold');
      doc.text(`Gerencia: ${gerencia.nombre}`);
      doc.moveDown(0.3);

      const vehiculosGerencia = vehiculosPorGerencia[gerencia.nombre] || [];

      if (vehiculosGerencia.length === 0) {
        doc.fontSize(9).font('Helvetica');
        doc.text('Sin vehículos registrados');
        doc.moveDown(0.5);
        continue;
      }

      for (const vehiculo of vehiculosGerencia) {
        checkPage(50);
        doc.fontSize(10).font('Helvetica-Bold');
        doc.text(
          `  ${vehiculo.marca} ${vehiculo.modelo} - ${vehiculo.placas} (${vehiculo.nombre_clave})`,
        );
        doc.moveDown(0.2);

        const cargasV = cargasPorVehiculo[vehiculo.nombre_clave] || [];
        const usosV = usosPorVehiculo[vehiculo.nombre_clave] || [];

        if (cargasV.length > 0) {
          doc.fontSize(9).font('Helvetica-Bold');
          doc.text('    Cargas de combustible:');
          doc.moveDown(0.1);

          const colWidths = [60, 55, 55, 55];
          drawTableHeader(
            ['Fecha', 'Operador', 'Km antes', 'Km después'],
            colWidths,
          );

          let totalKm = 0;
          for (const c of cargasV) {
            checkPage(20);
            drawTableRow(
              [
                new Date(c.created_at).toLocaleDateString('es-MX'),
                c.operador,
                c.km_bf_carga,
                c.km_af_carga,
              ],
              colWidths,
            );
            totalKm += Number(c.km_af_carga) - Number(c.km_bf_carga) || 0;
          }

          doc.fontSize(8).font('Helvetica-Bold');
          doc.text(`    Total km registrados en cargas: ${totalKm} km`, {
            indent: 20,
          });
          doc.moveDown(0.3);
        }

        if (usosV.length > 0) {
          checkPage(30);
          doc.fontSize(9).font('Helvetica-Bold');
          doc.text('    Usos de vehículo:');
          doc.moveDown(0.1);

          const colWidths = [60, 60, 50, 55, 55];
          drawTableHeader(
            ['Fecha', 'Conductor', 'Destino', 'Km inicio', 'Km final'],
            colWidths,
          );

          let totalKmUsos = 0;
          for (const u of usosV) {
            checkPage(20);
            drawTableRow(
              [
                new Date(u.created_at).toLocaleDateString('es-MX'),
                u.conductor,
                u.destino,
                u.kilometraje_inicial,
                u.kilometraje_final,
              ],
              colWidths,
            );
            totalKmUsos +=
              Number(u.kilometraje_final) - Number(u.kilometraje_inicial) || 0;
          }

          doc.fontSize(8).font('Helvetica-Bold');
          doc.text(`    Total km recorridos: ${totalKmUsos} km`, {
            indent: 20,
          });
          doc.moveDown(0.3);
        }

        if (vehiculo.km_ultimo_mantenimiento) {
          const kmActual =
            usosV.length > 0
              ? Math.max(...usosV.map((u) => Number(u.kilometraje_final || 0)))
              : Number(vehiculo.km_ultimo_mantenimiento);
          const kmDesdeManto =
            kmActual - Number(vehiculo.km_ultimo_mantenimiento);
          const intervalo = vehiculo.km_mantenimiento_cada
            ? Number(vehiculo.km_mantenimiento_cada)
            : null;

          doc.fontSize(8).font('Helvetica');
          doc.text(
            `    Último mantenimiento: ${Number(vehiculo.km_ultimo_mantenimiento).toLocaleString()} km`,
            { indent: 20 },
          );
          doc.text(
            `    Km desde mantenimiento: ${kmDesdeManto.toLocaleString()} km`,
            { indent: 20 },
          );

          if (intervalo && kmDesdeManto >= intervalo) {
            doc.font('Helvetica-Bold').fillColor('#cc0000');
            doc.text(
              `    ¡ALERTA: Requiere mantenimiento! (cada ${intervalo.toLocaleString()} km)`,
              { indent: 20 },
            );
            doc.fillColor('#000000');
          } else if (intervalo) {
            const restante = intervalo - kmDesdeManto;
            doc.text(
              `    Próximo mantenimiento en ${restante.toLocaleString()} km`,
              { indent: 20 },
            );
          }
          doc.moveDown(0.3);
        }
        doc.font('Helvetica');
      }
    }

    checkPage(40);
    doc.moveDown(1);
    doc.fontSize(10).font('Helvetica-Bold');
    doc.text('Resumen General', { align: 'center' });
    doc.moveDown(0.3);
    doc.fontSize(9).font('Helvetica');
    doc.text(`Total de registros de combustible: ${combustibles.length}`, {
      align: 'center',
    });
    doc.text(`Total de cargas: ${cargas.length}`, { align: 'center' });
    doc.text(`Total de usos de vehículo: ${usos.length}`, { align: 'center' });
    doc.text(`Gerencias reportadas: ${gerencias.length}`, { align: 'center' });
    doc.text(`Vehículos reportados: ${vehiculos.length}`, { align: 'center' });

    doc.moveDown(1);
    doc.fontSize(7).font('Helvetica').fillColor('#666666');
    doc.text(
      `Documento generado automáticamente por GTO Docs - ${new Date().toLocaleString('es-MX')}`,
      { align: 'center' },
    );
    doc.fillColor('#000000');
  }
}
