import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as bcrypt from 'bcryptjs';

@Injectable()
export class AuthRepository {
  constructor(private readonly prisma: PrismaService) {}

  private inferRolesFromCargo(input: {
    username?: string | null;
    cargoNombre?: string | null;
    cargoNivel?: string | null;
  }): string[] {
    const username = (input.username ?? '').toLowerCase();
    const cargoNombre = (input.cargoNombre ?? '').toLowerCase();
    const cargoNivel = (input.cargoNivel ?? '').toLowerCase();

    const isAdmin =
      username === 'admin' ||
      cargoNivel.includes('admin') ||
      cargoNombre.includes('admin');

    if (isAdmin) return ['ADMIN'];

    const isJefe = cargoNivel.includes('jefe') || cargoNombre.includes('jefe');
    return isJefe ? ['JEFE'] : ['USER'];
  }

  async validateUser(username: string, password: string) {
    const user = await this.prisma.user.findUnique({
      where: { username },
      include: { cargo: true },
    });

    if (!user) {
      return null;
    }

    const isValid = bcrypt.compareSync(password, user.passwordHash);

    if (!isValid) {
      return null;
    }

    return {
      id: user.id,
      username: user.username,
      nombre: user.nombre,
      area: user.area,
      gerenciaId: user.gerenciaId ?? null,
      jefaturaId: user.jefaturaId ? user.jefaturaId.toString() : null,
      cargoId: user.cargoId ?? null,
      cargoNombre: user.cargo?.nombre_cargo ?? user.cargoLegacy ?? null,
      cargoNivel: user.cargo?.nivel_cargo ?? null,
      roles: this.inferRolesFromCargo({
        username: user.username,
        cargoNombre: user.cargo?.nombre_cargo ?? user.cargoLegacy ?? null,
        cargoNivel: user.cargo?.nivel_cargo ?? null,
      }),
    };
  }

  async findUserByUsername(username: string) {
    const user = await this.prisma.user.findUnique({
      where: { username },
      include: { cargo: true },
    });

    if (!user) return null;

    return {
      id: user.id,
      username: user.username,
      nombre: user.nombre,
      area: user.area,
      gerenciaId: user.gerenciaId ?? null,
      jefaturaId: user.jefaturaId ? user.jefaturaId.toString() : null,
      cargoId: user.cargoId ?? null,
      cargoNombre: user.cargo?.nombre_cargo ?? user.cargoLegacy ?? null,
      cargoNivel: user.cargo?.nivel_cargo ?? null,
      roles: this.inferRolesFromCargo({
        username: user.username,
        cargoNombre: user.cargo?.nombre_cargo ?? user.cargoLegacy ?? null,
        cargoNivel: user.cargo?.nivel_cargo ?? null,
      }),
    };
  }

  async createUserFromAd(
    username: string,
    adInfo: { nombre: string; apellido?: string; email: string },
  ): Promise<{
    id: string;
    username: string;
    nombre: string;
    area: string;
    gerenciaId: number | null;
    jefaturaId: string | null;
    cargoId: number | null;
    cargoNombre: string | null;
    cargoNivel: string | null;
    roles: string[];
  }> {
    // Generar un hash de contraseña dummy (no se usará porque autentican por AD)
    // Usamos un hash válido pero aleatorio que nunca coincidirá con ninguna contraseña
    const dummyPasswordHash = bcrypt.hashSync(
      `${username}_AD_DUMMY_${Date.now()}`,
      10,
    );

    // Área por defecto si no se puede determinar
    const defaultArea = 'USUARIO';

    const user = await this.prisma.user.create({
      data: {
        username,
        passwordHash: dummyPasswordHash,
        nombre: adInfo.nombre,
        apellido: adInfo.apellido ?? null,
        email: adInfo.email,
        area: defaultArea,
        // gerenciaId, jefaturaId, cargoId se pueden configurar después
      },
      include: { cargo: true },
    });

    return {
      id: user.id,
      username: user.username,
      nombre: user.nombre,
      area: user.area,
      gerenciaId: user.gerenciaId ?? null,
      jefaturaId: user.jefaturaId ? user.jefaturaId.toString() : null,
      cargoId: user.cargoId ?? null,
      cargoNombre: user.cargo?.nombre_cargo ?? user.cargoLegacy ?? null,
      cargoNivel: user.cargo?.nivel_cargo ?? null,
      roles: this.inferRolesFromCargo({
        username: user.username,
        cargoNombre: user.cargo?.nombre_cargo ?? user.cargoLegacy ?? null,
        cargoNivel: user.cargo?.nivel_cargo ?? null,
      }),
    };
  }
}
