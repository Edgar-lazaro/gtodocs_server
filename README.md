# GTO Docs Backend 

## Correr con Docker (recomendado)

Requisitos: Docker Desktop (macOS/Windows) o Docker Engine + Compose (Linux).

1) Crear `.env`

- Copia el ejemplo: `cp .env.example .env`
- Ajusta al menos `JWT_SECRET` y `DATABASE_URL` si no usarás el Postgres del compose.

2) Levantar servicios

- Build + up: `docker compose up -d --build` (o `docker-compose up -d --build`)
- Ver logs: `docker compose logs -f gto_docs_backend` (o `docker-compose logs -f gto_docs_backend`)

El `docker-compose.yml` incluye un Postgres y corre migraciones automáticamente (servicio `migrate`).

3) Probar

- Health: `curl -fsS http://localhost:3000/api/health`
- Swagger (si `SWAGGER_ENABLED=true`): `http://localhost:3000/api/docs`

Notas:

- Persistencia de archivos: se monta `./uploads` dentro del contenedor y se usa vía `UPLOADS_DIR`.
- Para reiniciar “desde cero” (borra DB): `docker compose down -v`
- Para re-correr migraciones manualmente: `docker compose run --rm migrate` (o `docker-compose run --rm migrate`)

## Pruebas Postman (Newman)

Requiere tener la API corriendo y definir variables de entorno:

- `POSTMAN_BASE_URL` (ej: `http://localhost:3000`)
- `POSTMAN_USERNAME`
- `POSTMAN_PASSWORD`

Comandos:

- Suite completa: `npm run test:postman`
- Solo health: `npm run test:postman:health`

Por seguridad, el runner guarda por defecto solo JUnit en `reports/postman-report.xml`.

Si necesitas el JSON detallado (puede incluir bodies), habilítalo explícitamente:

- `node scripts/run-postman.mjs --report-json=true`

## GLPI (opcional)

Este backend incluye un endpoint admin para crear tickets en GLPI: `POST /api/glpi/tickets`.

Configura variables de entorno (ver `.env.example`):

- `GLPI_URL`: URL base de tu GLPI (sin `/apirest.php`).
- Recomendado: `GLPI_APP_TOKEN` + `GLPI_USER_TOKEN` (usa el flujo estándar `initSession`/`Session-Token`).
- Alternativo: `GLPI_TOKEN` (modo Bearer) solo si tu GLPI o un gateway frente a GLPI lo soporta.

