import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthService } from './auth.service';
import { AuthRepository } from './auth.repository';
import { JwtGuard } from './guards/jwt.guard';
import { CargosGuard } from './guards/cargos.guard';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthController } from './auth.controller';
import { AdLdapService } from './ldap/ad-ldap.service';

@Module({
  imports: [
    PrismaModule,
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'super-secret-key',
      signOptions: {
        expiresIn: process.env.JWT_EXPIRES_IN
          ? (process.env.JWT_EXPIRES_IN as any)
          : ('13h' as const),
      },
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    AuthRepository,
    AdLdapService,
    JwtGuard,
    CargosGuard,
  ],
  exports: [JwtModule, JwtGuard, CargosGuard],
})
export class AuthModule {}
