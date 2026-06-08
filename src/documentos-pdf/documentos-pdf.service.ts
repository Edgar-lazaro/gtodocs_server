import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { parseBigIntId, serializeBigInt } from '../common/serialize-bigint';
import { GlpiQueueService } from '../glpi/glpi-queue.service';
import { CreateDocumentoPdfDto } from './dto/create-documento-pdf.dto';
import { UpdateDocumentoPdfDto } from './dto/update-documento-pdf.dto';

@Injectable()
export class DocumentosPdfService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly glpiQueue: GlpiQueueService,
  ) {}

  private isAdmin(roles: string[] | undefined): boolean {
    return (
      Array.isArray(roles) &&
      roles.some((r) => String(r).toUpperCase() === 'ADMIN')
    );
  }

  private isJefe(roles: string[] | undefined): boolean {
    return (
      Array.isArray(roles) &&
      roles.some((r) => String(r).toUpperCase() === 'JEFE')
    );
  }

  async findAllForUser(
    userId: string,
    roles: string[],
    gerenciaId: number | null,
    jefaturaId: number | null,
  ) {
    const rows = await this.prisma.documentos_pdf.findMany({
      where: this.isAdmin(roles)
        ? gerenciaId === null
          ? { usuario_id: userId }
          : { gerencia_id: gerenciaId }
        : this.isJefe(roles)
          ? jefaturaId === null
            ? { usuario_id: userId }
            : { jefatura_id: jefaturaId }
          : { usuario_id: userId },
      orderBy: { fecha_creacion: 'desc' },
    });
    return serializeBigInt(rows);
  }

  async findMine(userId: string) {
    const rows = await this.prisma.documentos_pdf.findMany({
      where: { usuario_id: userId },
      orderBy: { fecha_creacion: 'desc' },
    });
    return serializeBigInt(rows);
  }

  async findOneForUser(
    idRaw: string,
    userId: string,
    roles: string[],
    gerenciaId: number | null,
    jefaturaId: number | null,
  ) {
    let id: bigint;
    try {
      id = parseBigIntId(idRaw);
    } catch {
      throw new BadRequestException('Invalid id');
    }

    const row = await this.prisma.documentos_pdf.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Not found');

    if (this.isAdmin(roles)) {
      if (gerenciaId === null) {
        // Si no tenemos gerencia en JWT, degradar a comportamiento seguro.
        if (row.usuario_id !== userId) throw new NotFoundException('Not found');
      } else if (row.gerencia_id !== gerenciaId) {
        throw new NotFoundException('Not found');
      }
    } else if (this.isJefe(roles)) {
      if (jefaturaId === null) {
        if (row.usuario_id !== userId) throw new NotFoundException('Not found');
      } else if (row.jefatura_id !== jefaturaId) {
        throw new NotFoundException('Not found');
      }
    } else {
      if (row.usuario_id !== userId) throw new NotFoundException('Not found');
    }

    return serializeBigInt(row);
  }

  async create(
    userId: string,
    identity: {
      username: string;
      gerenciaId: number | null;
      jefaturaId: number | null;
    },
    dto: CreateDocumentoPdfDto,
  ) {
    const usuarioNombre =
      identity.username.length > 0 ? identity.username : dto.usuario_nombre;
    const gerenciaId = identity.gerenciaId ?? dto.gerencia_id;
    const jefaturaId = identity.jefaturaId ?? dto.jefatura_id;

    const created = await this.prisma.documentos_pdf.create({
      data: {
        nombre_archivo: dto.nombre_archivo,
        tipo_documento: dto.tipo_documento,
        url_storage: dto.url_storage,
        usuario_id: userId,
        usuario_nombre: usuarioNombre,
        gerencia_id: gerenciaId,
        jefatura_id: jefaturaId,
        checklist_nombre: dto.checklist_nombre,
        tamano_bytes: dto.tamano_bytes ? BigInt(dto.tamano_bytes) : undefined,
      },
    });

    await this.glpiQueue.enqueueTicket({
      title: `PDF: ${created.nombre_archivo}`,
      description: [
        `tipo_documento: ${created.tipo_documento}`,
        `usuario: ${created.usuario_nombre} (${created.usuario_id})`,
        `gerencia_id: ${created.gerencia_id}`,
        `jefatura_id: ${created.jefatura_id}`,
        `checklist: ${created.checklist_nombre}`,
        `url: ${created.url_storage}`,
      ].join('\n'),
      assignedUserId: created.usuario_id,
      requesterUserId: created.usuario_id,
      source: { entity: 'documentos_pdf', id: created.id.toString() },
    });

    return serializeBigInt(created);
  }

  async update(idRaw: string, dto: UpdateDocumentoPdfDto) {
    let id: bigint;
    try {
      id = parseBigIntId(idRaw);
    } catch {
      throw new BadRequestException('Invalid id');
    }

    const data: Prisma.documentos_pdfUpdateInput = {
      ...dto,
      tamano_bytes: dto.tamano_bytes ? BigInt(dto.tamano_bytes) : undefined,
    };

    try {
      const updated = await this.prisma.documentos_pdf.update({
        where: { id },
        data,
      });
      return serializeBigInt(updated);
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2025'
      ) {
        throw new NotFoundException('Not found');
      }
      throw err;
    }
  }

  async remove(idRaw: string) {
    let id: bigint;
    try {
      id = parseBigIntId(idRaw);
    } catch {
      throw new BadRequestException('Invalid id');
    }

    try {
      const deleted = await this.prisma.documentos_pdf.delete({
        where: { id },
      });
      return serializeBigInt(deleted);
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2025'
      ) {
        throw new NotFoundException('Not found');
      }
      throw err;
    }
  }
}
