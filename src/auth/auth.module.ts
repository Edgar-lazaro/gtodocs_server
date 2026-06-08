import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
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
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const secret = (config.get<string>('JWT_SECRET') ?? '').trim();
        if (!secret) {
          throw new Error(
            'JWT_SECRET no configurado (define JWT_SECRET en variables de entorno)',
          );
        }

        return {
          secret,
          signOptions: {
            expiresIn: config.get<string>('JWT_EXPIRES_IN')
              ? (config.get<string>('JWT_EXPIRES_IN') as any)
              : ('13h' as const),
          },
        };
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
