-- AlterTable: agregar gerenciaId solo si las tablas existen (evita error en DB sin schema legacy)
DO $$
BEGIN
  IF to_regclass('public.carga_car_tics') IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='carga_car_tics' AND column_name='gerenciaId') THEN
      ALTER TABLE "carga_car_tics" ADD COLUMN "gerenciaId" SMALLINT;
      ALTER TABLE "carga_car_tics" ADD CONSTRAINT "carga_car_tics_gerenciaId_fkey" 
        FOREIGN KEY ("gerenciaId") REFERENCES "gerencias"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
    END IF;
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.uso_car_tics') IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='uso_car_tics' AND column_name='gerenciaId') THEN
      ALTER TABLE "uso_car_tics" ADD COLUMN "gerenciaId" SMALLINT;
      ALTER TABLE "uso_car_tics" ADD CONSTRAINT "uso_car_tics_gerenciaId_fkey" 
        FOREIGN KEY ("gerenciaId") REFERENCES "gerencias"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
    END IF;
  END IF;
END $$;
