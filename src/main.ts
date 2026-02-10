import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from './prisma/prisma.service';
import * as express from 'express';
import * as path from 'path';
import * as fs from 'fs';
import helmet from 'helmet';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { resolveUploadsRoot } from './uploads/uploads.util';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const logger = new Logger('bootstrap');
  const config = app.get(ConfigService);

  // Basic request logging (method, path, status, duration)
  app.use(
    (
      req: express.Request,
      res: express.Response,
      next: express.NextFunction,
    ) => {
      const startedAt = Date.now();
      res.on('finish', () => {
        const ms = Date.now() - startedAt;
        logger.log(
          `[http] ${req.method} ${req.originalUrl} ${res.statusCode} ${ms}ms`,
        );
      });
      next();
    },
  );

  app.enableShutdownHooks();

  const trustProxy =
    (config.get<string>('TRUST_PROXY') ?? '').toLowerCase() === 'true';
  if (trustProxy) {
    const instance = app.getHttpAdapter().getInstance();
    instance.set('trust proxy', 1);
  }

  const bodyLimit = config.get<string>('BODY_LIMIT') ?? '10mb';
  app.use(express.json({ limit: bodyLimit }));
  app.use(express.urlencoded({ extended: true, limit: bodyLimit }));

  const enableCors =
    (config.get<string>('CORS_ENABLED') ?? '').toLowerCase() === 'true';
  if (enableCors) {
    app.enableCors({ origin: true, credentials: true });
  }

  const disableHelmet =
    (config.get<string>('HELMET_DISABLED') ?? '').toLowerCase() === 'true';
  if (!disableHelmet) {
    app.use(
      helmet({
        crossOriginResourcePolicy: false,
      }),
    );
  }

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.setGlobalPrefix('api');

  const uploadsRoot = resolveUploadsRoot();
  fs.mkdirSync(uploadsRoot, { recursive: true });
  // Legacy layout (mantener por compatibilidad con URLs ya guardadas)
  const tareasUploads = path.join(uploadsRoot, 'tareas');
  fs.mkdirSync(tareasUploads, { recursive: true });
  fs.mkdirSync(path.join(tareasUploads, 'pdfs'), { recursive: true });
  fs.mkdirSync(path.join(tareasUploads, 'imagenes'), { recursive: true });
  fs.mkdirSync(path.join(tareasUploads, 'otros'), { recursive: true });

  // Nuevo layout: separar por tipo (imagenes/documentos) y por módulo
  fs.mkdirSync(path.join(uploadsRoot, 'imagenes', 'tareas'), {
    recursive: true,
  });
  fs.mkdirSync(path.join(uploadsRoot, 'imagenes', 'reportes'), {
    recursive: true,
  });
  fs.mkdirSync(path.join(uploadsRoot, 'imagenes', 'checklists'), {
    recursive: true,
  });
  fs.mkdirSync(path.join(uploadsRoot, 'imagenes', 'carga-car-tics'), {
    recursive: true,
  });
  fs.mkdirSync(path.join(uploadsRoot, 'imagenes', 'uso-car-tics'), {
    recursive: true,
  });
  fs.mkdirSync(path.join(uploadsRoot, 'documentos', 'tareas', 'pdfs'), {
    recursive: true,
  });
  fs.mkdirSync(path.join(uploadsRoot, 'documentos', 'tareas', 'otros'), {
    recursive: true,
  });
  fs.mkdirSync(path.join(uploadsRoot, 'documentos', 'reportes', 'pdfs'), {
    recursive: true,
  });
  fs.mkdirSync(path.join(uploadsRoot, 'documentos', 'reportes', 'otros'), {
    recursive: true,
  });
  fs.mkdirSync(path.join(uploadsRoot, 'documentos', 'checklists', 'pdfs'), {
    recursive: true,
  });
  fs.mkdirSync(path.join(uploadsRoot, 'documentos', 'checklists', 'otros'), {
    recursive: true,
  });
  app.use('/uploads', express.static(uploadsRoot));

  const swaggerEnabledEnv = (
    config.get<string>('SWAGGER_ENABLED') ?? ''
  ).toLowerCase();
  const swaggerEnabled =
    swaggerEnabledEnv === '' ? true : swaggerEnabledEnv === 'true';
  if (swaggerEnabled) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('GTO Docs API')
      .setDescription('Intranet API')
      .setVersion('1.0')
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('api/docs', app, document);
  }

  try {
    const prisma = app.get(PrismaService);
    const [row] = await prisma.$queryRaw<
      Array<{
        database: string;
        server_addr: string | null;
        server_port: number | null;
      }>
    >`
      select
        current_database() as database,
        inet_server_addr()::text as server_addr,
        inet_server_port() as server_port
    `;
    logger.log(
      `[db] ${row?.database ?? 'unknown'} @ ${row?.server_addr ?? 'n/a'}:${row?.server_port ?? 'n/a'}`,
    );
  } catch {}

  const port = Number(config.get<string>('PORT') ?? 3000);
  const host = config.get<string>('HOST') ?? '0.0.0.0';
  await app.listen(port, host);
  const publicBase = config.get<string>('PUBLIC_BASE_URL')?.trim();
  const hintBase =
    publicBase && publicBase.length > 0 ? publicBase : `http://${host}:${port}`;
  logger.log(`listening on ${hintBase}/api`);
}
bootstrap();
