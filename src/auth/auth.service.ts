import {
  Injectable,
  InternalServerErrorException,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AuthRepository } from './auth.repository';
import { AdLdapService } from './ldap/ad-ldap.service';
import axios from 'axios';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly repo: AuthRepository,
    private readonly jwt: JwtService,
    private readonly adLdap: AdLdapService,
  ) {}

  /** Busca el ID entero del usuario en GLPI por su nombre de usuario. Retorna null si falla. */
  private async findGlpiUserId(username: string): Promise<number | null> {
    const glpiBase = (process.env.GLPI_URL ?? '').replace(/\/$/, '') + '/apirest.php';
    const appToken = process.env.GLPI_APP_TOKEN;
    const userToken = process.env.GLPI_USER_TOKEN;
    if (!appToken || !userToken) return null;
    try {
      const sessionResp = await axios.get(`${glpiBase}/initSession`, {
        headers: { 'App-Token': appToken, 'Authorization': `user_token ${userToken}` },
        timeout: 8000,
      });
      const sessionToken: string = sessionResp.data?.session_token;
      if (!sessionToken) return null;

      const headers = { 'App-Token': appToken, 'Session-Token': sessionToken };
      try {
        const usersResp = await axios.get(`${glpiBase}/User`, {
          headers,
          params: { 'searchText[name]': username, 'range': '0-10' },
          timeout: 8000,
        });
        const users: any[] = Array.isArray(usersResp.data) ? usersResp.data : [];
        const match = users.find((u: any) => u.name === username);
        return (match?.id as number) ?? null;
      } finally {
        await axios.get(`${glpiBase}/killSession`, { headers, timeout: 4000 }).catch(() => {});
      }
    } catch {
      return null;
    }
  }

  async login(username: string, password: string) {
    try {
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

      // Obtener ID entero de GLPI para el usuario (sin bloquear el login si falla)
      const glpiUserId = await this.findGlpiUserId(user.username ?? username);

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
        glpiUserId: glpiUserId ?? null,
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
          glpiUserId: glpiUserId ?? null,
        },
      };
    } catch (error) {
      if (
        error instanceof UnauthorizedException ||
        error instanceof InternalServerErrorException
      ) {
        throw error;
      }

      this.logger.error(
        `Unexpected login error for '${username}': ${
          error instanceof Error ? error.stack ?? error.message : String(error)
        }`,
      );
      throw new InternalServerErrorException(
        'Error interno durante autenticacion',
      );
    }
  }
}
