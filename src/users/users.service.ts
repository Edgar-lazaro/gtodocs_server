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
        username: true,
        nombre: true,
        apellido: true,
      },
      orderBy: [{ nombre: 'asc' }, { apellido: 'asc' }],
    });

    return rows.map((r) => ({
      id: r.id,
      username: r.username,
      nombre: [r.nombre, r.apellido].filter(Boolean).join(' '),
    }));
  }
}
