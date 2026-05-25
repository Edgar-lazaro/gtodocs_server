import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AuthRepository } from './auth.repository';
import { AdLdapService } from './ldap/ad-ldap.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly repo: AuthRepository,
    private readonly jwt: JwtService,
    private readonly adLdap: AdLdapService,
  ) {}

  async login(username: string, password: string) {
    let user = await this.repo.validateUser(username, password);

    if (!user && this.adLdap.isEnabled()) {
      const ok = await this.adLdap.validateCredentials(username, password);
      if (ok) {
        // Buscar usuario existente en la BD
        user = await this.repo.findUserByUsername(username);

        // Si no existe, crear automáticamente desde AD
        if (!user) {
          const adInfo = await this.adLdap.getUserInfo(username, password);
          if (adInfo) {
            try {
              user = await this.repo.createUserFromAd(username, adInfo);
            } catch (error: any) {
              // Si falla la creación (ej: username duplicado por condición de carrera),
              // intentar buscar de nuevo
              user = await this.repo.findUserByUsername(username);
              if (!user) {
                throw new UnauthorizedException(
                  'Error al crear usuario desde Active Directory',
                );
              }
            }
          } else {
            throw new UnauthorizedException(
              'No se pudo obtener información del usuario desde Active Directory',
            );
          }
        }
      }
    }

    if (!user) throw new UnauthorizedException('Credenciales inválidas');

    const payload = {
      sub: user.id,
      id: user.id,
      area: user.area,
      username: user.username ?? user.nombre,
      roles: user.roles ?? [],
      gerenciaId: user.gerenciaId ?? null,
      jefaturaId: user.jefaturaId ?? null,
      cargoId: user.cargoId ?? null,
      cargoNombre: user.cargoNombre ?? null,
      cargoNivel: user.cargoNivel ?? null,
    };

    return {
      token: this.jwt.sign(payload),
      user: {
        id: user.id,
        nombre: user.nombre,
        area: user.area,
        roles: user.roles ?? [],
        gerenciaId: user.gerenciaId ?? null,
        jefaturaId: user.jefaturaId ?? null,
        cargoId: user.cargoId ?? null,
        cargoNombre: user.cargoNombre ?? null,
        cargoNivel: user.cargoNivel ?? null,
      },
    };
  }
}
