import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

// Rastrea intentos de login por username, no por IP. Con 150-250 usuarios
// saliendo por la misma IP/NAT (red del aeropuerto), limitar por IP los
// bloquearia entre si; limitar por username protege contra fuerza bruta
// sobre una cuenta puntual sin afectar a los demas.
@Injectable()
export class AuthThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: Record<string, any>): Promise<string> {
    const username = String(req.body?.username ?? '').trim().toLowerCase();
    return username || req.ip;
  }
}
