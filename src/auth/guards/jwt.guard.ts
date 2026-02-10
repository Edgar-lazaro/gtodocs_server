import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

@Injectable()
export class JwtGuard implements CanActivate {
  constructor(private jwtService: JwtService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const authHeader = String(request.headers.authorization ?? '').trim();
    let token = '';

    if (!authHeader) {
      throw new UnauthorizedException('Token requerido');
    }

    // Accept common variants: "Bearer <token>", "bearer <token>", "Bearer:<token>".
    if (/^bearer\b/i.test(authHeader)) {
      token = authHeader.replace(/^bearer\b\s*:?\s*/i, '').trim();
    } else if (authHeader.split('.').length === 3) {
      // Some clients send the raw JWT without the Bearer prefix.
      token = authHeader;
    }

    token = token.replace(/^"|"$/g, '').trim();

    if (!token) {
      throw new UnauthorizedException('Token requerido');
    }

    try {
      const payload = this.jwtService.verify(token);
      request.user = payload;
      return true;
    } catch {
      throw new UnauthorizedException('Token inválido');
    }
  }
}
