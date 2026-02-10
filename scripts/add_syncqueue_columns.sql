-- Agregar columnas faltantes a SyncQueue (de migración 20260120)
DO $$
BEGIN
  IF to_regclass('public."SyncQueue"') IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='SyncQueue' AND column_name='status') THEN
      ALTER TABLE "SyncQueue" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'pending';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='SyncQueue' AND column_name='retries') THEN
      ALTER TABLE "SyncQueue" ADD COLUMN "retries" INTEGER NOT NULL DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='SyncQueue' AND column_name='maxRetries') THEN
      ALTER TABLE "SyncQueue" ADD COLUMN "maxRetries" INTEGER NOT NULL DEFAULT 20;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='SyncQueue' AND column_name='lastError') THEN
      ALTER TABLE "SyncQueue" ADD COLUMN "lastError" TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='SyncQueue' AND column_name='nextRunAt') THEN
      ALTER TABLE "SyncQueue" ADD COLUMN "nextRunAt" TIMESTAMPTZ(6);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='SyncQueue' AND column_name='lockedAt') THEN
      ALTER TABLE "SyncQueue" ADD COLUMN "lockedAt" TIMESTAMPTZ(6);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='SyncQueue' AND column_name='processedAt') THEN
      ALTER TABLE "SyncQueue" ADD COLUMN "processedAt" TIMESTAMPTZ(6);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='SyncQueue' AND column_name='updatedAt') THEN
      ALTER TABLE "SyncQueue" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='SyncQueue' AND column_name='procesado') THEN
      ALTER TABLE "SyncQueue" ADD COLUMN "procesado" BOOLEAN NOT NULL DEFAULT false;
    END IF;
  END IF;
END $$;
