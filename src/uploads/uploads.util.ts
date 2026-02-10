import * as path from 'path';
import type { Request } from 'express';

export type UploadModulo =
  | 'tareas'
  | 'reportes'
  | 'checklists'
  | 'carga-car-tics'
  | 'uso-car-tics';

type UploadFileInfo = { originalname?: string; mimetype?: string };

type Classified = { kind: 'imagen' } | { kind: 'pdf' } | { kind: 'otro' };

function stripTrailingSlashes(value: string): string {
  return value.replace(/\/+$/, '');
}

export function resolveUploadsRoot(): string {
  const storageRoot = (process.env.STORAGE_ROOT ?? '').trim();
  if (storageRoot.length > 0) return path.resolve(storageRoot);

  const uploadsDir = (process.env.UPLOADS_DIR ?? '').trim();
  if (uploadsDir.length > 0) return path.resolve(uploadsDir);

  // Default: store in repo root `server_storage/` when running from `gto_docs_backend/`
  return path.resolve(process.cwd(), '..', 'server_storage');
}

function classify(file?: UploadFileInfo): Classified {
  const mimetype = (file?.mimetype ?? '').toLowerCase();
  const ext = (path.extname(file?.originalname ?? '') ?? '').toLowerCase();

  if (mimetype === 'application/pdf' || ext === '.pdf') return { kind: 'pdf' };

  if (mimetype.startsWith('image/')) return { kind: 'imagen' };
  if (
    [
      '.jpg',
      '.jpeg',
      '.png',
      '.gif',
      '.webp',
      '.heic',
      '.heif',
      '.bmp',
    ].includes(ext)
  )
    return { kind: 'imagen' };

  return { kind: 'otro' };
}

export function resolveAdjuntoRelativeDir(
  modulo: UploadModulo,
  file?: UploadFileInfo,
): string {
  const kind = classify(file);
  if (kind.kind === 'imagen') return path.join('imagenes', modulo);
  if (kind.kind === 'pdf') return path.join('documentos', modulo, 'pdfs');
  if (modulo === 'carga-car-tics' || modulo === 'uso-car-tics')
    return path.join('imagenes', modulo);
  return path.join('documentos', modulo, 'otros');
}

export function resolveUploadsBase(req: Request): string {
  const uploadsBaseEnv = (process.env.UPLOADS_BASE ?? '').trim();
  if (uploadsBaseEnv.length > 0) return stripTrailingSlashes(uploadsBaseEnv);

  const publicBase = (process.env.PUBLIC_BASE_URL ?? '').trim();
  const base =
    publicBase.length > 0
      ? stripTrailingSlashes(publicBase)
      : `${req.protocol}://${req.get('host')}`;

  return `${base}/uploads`;
}

export function buildPublicFileUrl(
  req: Request,
  relativeDir: string,
  filename: string,
): string {
  const uploadsBase = resolveUploadsBase(req);
  const relativePosix = relativeDir.split(path.sep).join(path.posix.sep);
  const filePath = path.posix.join(relativePosix, filename);
  return `${uploadsBase}/${filePath}`;
}
