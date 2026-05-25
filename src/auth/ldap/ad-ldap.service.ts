import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as ldap from 'ldapjs';

function escapeLdapFilter(value: string): string {
  return value.replace(/[\\()*\u0000]/g, (ch) => {
    switch (ch) {
      case '\\':
        return '\\5c';
      case '*':
        return '\\2a';
      case '(':
        return '\\28';
      case ')':
        return '\\29';
      case '\u0000':
        return '\\00';
      default:
        return ch;
    }
  });
}

@Injectable()
export class AdLdapService {
  private readonly logger = new Logger(AdLdapService.name);

  constructor(private readonly config: ConfigService) {}

  isEnabled(): boolean {
    return (
      (this.config.get<string>('AD_ENABLED') ?? '').toLowerCase() === 'true'
    );
  }

  private createClient() {
    const url = this.config.get<string>('AD_URL');
    if (!url) {
      throw new Error('AD_URL is not configured');
    }

    const rejectUnauthorizedRaw = (
      this.config.get<string>('AD_TLS_REJECT_UNAUTHORIZED') ?? 'true'
    ).toLowerCase();
    const rejectUnauthorized = rejectUnauthorizedRaw !== 'false';

    return ldap.createClient({
      url,
      timeout: Number(this.config.get<string>('AD_TIMEOUT_MS') ?? 8000),
      connectTimeout: Number(
        this.config.get<string>('AD_CONNECT_TIMEOUT_MS') ?? 8000,
      ),
      tlsOptions: { rejectUnauthorized },
    });
  }

  private bind(
    client: ldap.Client,
    dn: string,
    password: string,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      client.bind(dn, password, (err) => {
        if (err) return reject(err);
        resolve();
      });
    });
  }

  private unbindQuietly(client: ldap.Client) {
    try {
      client.unbind();
    } catch {
      // ignore
    }
  }

  private searchFirstDn(
    client: ldap.Client,
    baseDn: string,
    username: string,
  ): Promise<string | null> {
    const filter = `(&(objectClass=user)(sAMAccountName=${escapeLdapFilter(username)}))`;

    return new Promise((resolve, reject) => {
      client.search(
        baseDn,
        {
          scope: 'sub',
          filter,
          paged: false,
          sizeLimit: 1,
          attributes: ['dn'],
        },
        (err, res) => {
          if (err) return reject(err);

          let found: string | null = null;

          res.on('searchEntry', (entry) => {
            const dn =
              (entry?.objectName as unknown as string) ??
              (entry?.dn as unknown as string);
            if (dn && !found) found = dn;
          });
          res.on('error', (e) => reject(e));
          res.on('end', () => resolve(found));
        },
      );
    });
  }

  private searchUserInfo(
    client: ldap.Client,
    baseDn: string,
    username: string,
  ): Promise<{
    dn: string;
    cn?: string;
    displayName?: string;
    givenName?: string;
    sn?: string;
    mail?: string;
  } | null> {
    const filter = `(&(objectClass=user)(sAMAccountName=${escapeLdapFilter(username)}))`;

    return new Promise((resolve, reject) => {
      client.search(
        baseDn,
        {
          scope: 'sub',
          filter,
          paged: false,
          sizeLimit: 1,
          attributes: ['dn', 'cn', 'displayName', 'givenName', 'sn', 'mail'],
        },
        (err, res) => {
          if (err) return reject(err);

          let found: {
            dn: string;
            cn?: string;
            displayName?: string;
            givenName?: string;
            sn?: string;
            mail?: string;
          } | null = null;

          res.on('searchEntry', (entry) => {
            const dn =
              (entry?.objectName as unknown as string) ??
              (entry?.dn as unknown as string);
            if (dn && !found) {
              const attrs = entry.attributes || [];
              const getAttr = (name: string): string | undefined => {
                const attr = attrs.find(
                  (a: any) => a.type === name || a._name === name,
                );
                if (!attr) return undefined;
                const values = attr.values || [];
                return values.length > 0 ? String(values[0]) : undefined;
              };

              found = {
                dn,
                cn: getAttr('cn'),
                displayName: getAttr('displayName'),
                givenName: getAttr('givenName'),
                sn: getAttr('sn'),
                mail: getAttr('mail'),
              };
            }
          });
          res.on('error', (e) => reject(e));
          res.on('end', () => resolve(found));
        },
      );
    });
  }

  async getUserInfo(username: string, password?: string): Promise<{
    nombre: string;
    apellido?: string;
    email: string;
  } | null> {
    if (!this.isEnabled()) return null;
    if (!username) return null;

    const baseDn = (this.config.get<string>('AD_BASE_DN') ?? '').trim();
    const serviceBindDn = (
      this.config.get<string>('AD_SERVICE_BIND_DN') ?? ''
    ).trim();
    const serviceBindPassword =
      this.config.get<string>('AD_SERVICE_BIND_PASSWORD') ?? '';

    if (!baseDn) {
      this.logger.warn(
        'Cannot get user info from AD: AD_BASE_DN are required',
      );
      return null;
    }

     if (!service BindDn && !password){
	this.logger.warn(
	'Cannon get user info froM AD: either AD_SERVICE_BIND_DN or user password is required'
	);
	return null;
	}

    const client = this.createClient();
    try {
	if(serviceBindDn && serviceBinPassword){
      await this.bind(client, serviceBindDn, serviceBindPassword);
	}
	else if(password){
	conts upnSuffix = (this.config.get<string>('AD_UPN_SUFFIX') ?? '').trim();
	conts upn = upnsuffix
		? `${username}@${upnsuffix.replace(/^@/, '').trim();
		: `${username}@gtodocs.com`;
		await this.bind(client, upn, password);
	}
      const userInfo = await this.searchUserInfo(client, baseDn, username);

      if (!userInfo) return null;

      // Construir nombre completo: displayName > cn > givenName
      let nombre =
        userInfo.displayName || userInfo.cn || userInfo.givenName || username;
      const apellido = userInfo.sn || null

      // Si tenemos givenName pero no displayName/cn, usar givenName como nombre
      if (!userInfo.displayName && !userInfo.cn && userInfo.givenName) {
        nombre = userInfo.givenName;
      }

      // Email es requerido, usar uno por defecto si no está disponible
      const email =
        userInfo.mail ||
        `${username}@${this.config.get<string>('AD_UPN_SUFFIX') || 'example.com'}`;

      return {
        nombre: nombre.trim(),
        apellido: apellido?.trim() || undefined,
        email: email.trim(),
      };
    } catch (err: any) {
      this.logger.debug(
        `Failed to get user info from AD: ${err?.message ?? err}`,
      );
      return null;
    } finally {
      this.unbindQuietly(client);
    }
  }

  private buildBindCandidates(username: string): string[] {
    const candidates: string[] = [];

    const template = (
      this.config.get<string>('AD_BIND_DN_TEMPLATE') ?? ''
    ).trim();
    if (template) {
      candidates.push(template.replace(/%u/g, username));
    }

    const upnSuffix = (this.config.get<string>('AD_UPN_SUFFIX') ?? '').trim();
    if (upnSuffix) {
      candidates.push(`${username}@${upnSuffix}`);
    }

    const domain = (this.config.get<string>('AD_DOMAIN') ?? '').trim();
    if (domain) {
      candidates.push(`${domain}\\${username}`);
    }

    return candidates;
  }

  async validateCredentials(
    username: string,
    password: string,
  ): Promise<boolean> {
    if (!this.isEnabled()) return false;
    if (!username || !password) return false;

    const baseDn = (this.config.get<string>('AD_BASE_DN') ?? '').trim();
    const serviceBindDn = (
      this.config.get<string>('AD_SERVICE_BIND_DN') ?? ''
    ).trim();
    const serviceBindPassword =
      this.config.get<string>('AD_SERVICE_BIND_PASSWORD') ?? '';

    // Preferred: service bind + search DN + user bind
    if (baseDn && serviceBindDn && serviceBindPassword) {
      const client = this.createClient();
      try {
        await this.bind(client, serviceBindDn, serviceBindPassword);
        const userDn = await this.searchFirstDn(client, baseDn, username);
        if (!userDn) return false;

        // Re-bind as the user to verify password
        await this.bind(client, userDn, password);
        return true;
      } catch (err: any) {
        this.logger.debug(
          `AD validate failed (service+search): ${err?.message ?? err}`,
        );
        return false;
      } finally {
        this.unbindQuietly(client);
      }
    }

    // Fallback: direct bind formats (UPN / DOMAIN\\user / template)
    const candidates = this.buildBindCandidates(username);
    if (candidates.length === 0) {
      this.logger.warn(
        'AD_ENABLED=true but no bind method configured (set AD_BASE_DN+AD_SERVICE_BIND_* or AD_UPN_SUFFIX/AD_DOMAIN/AD_BIND_DN_TEMPLATE)',
      );
      return false;
    }

    for (const dn of candidates) {
      const client = this.createClient();
      try {
        await this.bind(client, dn, password);
        return true;
      } catch (err: any) {
        this.logger.debug(`AD bind failed for '${dn}': ${err?.message ?? err}`);
      } finally {
        this.unbindQuietly(client);
      }
    }

    return false;
  }
}
