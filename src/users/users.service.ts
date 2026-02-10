import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async list(params: { gerenciaId?: number }) {
    const where = params.gerenciaId ? { gerenciaId: params.gerenciaId } : {};

    const rows = await this.prisma.user.findMany({
      where,
      select: {
        id: true,
        nombre: true,
        apellido: true,
      },
      orderBy: [{ nombre: 'asc' }, { apellido: 'asc' }],
    });

    return rows.map((r) => ({
      id: r.id,
      nombre: [r.nombre, r.apellido].filter(Boolean).join(' '),
    }));
  }
}
