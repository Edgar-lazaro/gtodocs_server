-- Sincroniza la BD con el schema de Prisma (solo agrega lo que falta, no borra tablas)
-- Ejecutar: psql -U lazaro -d gto_docs_bd -f scripts/sync_db_with_schema.sql

-- 1) User: columnas que espera el schema
DO $$
BEGIN
  IF to_regclass('public."User"') IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='User' AND column_name='apellido') THEN
      ALTER TABLE "User" ADD COLUMN "apellido" TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='User' AND column_name='gerenciaId') THEN
      ALTER TABLE "User" ADD COLUMN "gerenciaId" SMALLINT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='User' AND column_name='jefaturaId') THEN
      ALTER TABLE "User" ADD COLUMN "jefaturaId" BIGINT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='User' AND column_name='cargoId') THEN
      ALTER TABLE "User" ADD COLUMN "cargoId" INTEGER;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='User' AND column_name='cargoLegacy') THEN
      ALTER TABLE "User" ADD COLUMN "cargoLegacy" TEXT;
    END IF;
  END IF;
END $$;

-- 2) cl_existentes: funcion_form
DO $$
BEGIN
  IF to_regclass('public.cl_existentes') IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='cl_existentes' AND column_name='funcion_form') THEN
      ALTER TABLE cl_existentes ADD COLUMN funcion_form TEXT NOT NULL DEFAULT 'FilesEdit_manto';
    END IF;
  END IF;
END $$;

-- 3) gerencias: carga_gas, uso_car; nombre NOT NULL
DO $$
BEGIN
  IF to_regclass('public.gerencias') IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='gerencias' AND column_name='carga_gas') THEN
      ALTER TABLE gerencias ADD COLUMN carga_gas TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='gerencias' AND column_name='uso_car') THEN
      ALTER TABLE gerencias ADD COLUMN uso_car TEXT;
    END IF;
    -- nombre NOT NULL solo si no hay nulls
    IF NOT EXISTS (SELECT 1 FROM gerencias WHERE nombre IS NULL) THEN
      ALTER TABLE gerencias ALTER COLUMN nombre SET NOT NULL;
    END IF;
  END IF;
END $$;

-- 3b) Índice único gerencias.nombre (necesario para FK vehiculos -> gerencias)
CREATE UNIQUE INDEX IF NOT EXISTS gerencias_nombre_key ON public.gerencias(nombre);

-- 4) Crear tabla vehiculos si no existe
CREATE TABLE IF NOT EXISTS public.vehiculos (
  id BIGSERIAL NOT NULL,
  created_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  marca TEXT NOT NULL,
  modelo TEXT NOT NULL,
  placas TEXT NOT NULL,
  gerencia VARCHAR NOT NULL,
  nombre_clave TEXT NOT NULL,
  CONSTRAINT vehiculos_pkey PRIMARY KEY (id)
);
CREATE UNIQUE INDEX IF NOT EXISTS vehiculos_nombre_clave_key ON public.vehiculos(nombre_clave);

-- 5) FKs de User a gerencias, jefaturas, cargos (si no existen)
DO $$
BEGIN
  IF to_regclass('public.gerencias') IS NOT NULL AND to_regclass('public."User"') IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'User_gerenciaId_fkey' AND table_name = 'User') THEN
      ALTER TABLE "User" ADD CONSTRAINT "User_gerenciaId_fkey" FOREIGN KEY ("gerenciaId") REFERENCES gerencias(id) ON DELETE NO ACTION ON UPDATE NO ACTION;
    END IF;
  END IF;
  IF to_regclass('public.jefaturas') IS NOT NULL AND to_regclass('public."User"') IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'User_jefaturaId_fkey' AND table_name = 'User') THEN
      ALTER TABLE "User" ADD CONSTRAINT "User_jefaturaId_fkey" FOREIGN KEY ("jefaturaId") REFERENCES jefaturas(id) ON DELETE NO ACTION ON UPDATE NO ACTION;
    END IF;
  END IF;
  IF to_regclass('public.cargos') IS NOT NULL AND to_regclass('public."User"') IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'User_cargoId_fkey' AND table_name = 'User') THEN
      ALTER TABLE "User" ADD CONSTRAINT "User_cargoId_fkey" FOREIGN KEY ("cargoId") REFERENCES cargos(id) ON DELETE NO ACTION ON UPDATE NO ACTION;
    END IF;
  END IF;
END $$;

-- 6) FK vehiculos -> gerencias(nombre)
DO $$
BEGIN
  IF to_regclass('public.vehiculos') IS NOT NULL AND to_regclass('public.gerencias') IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'vehiculos_gerencia_fkey' AND table_name = 'vehiculos') THEN
      ALTER TABLE vehiculos ADD CONSTRAINT vehiculos_gerencia_fkey FOREIGN KEY (gerencia) REFERENCES gerencias(nombre) ON DELETE NO ACTION ON UPDATE NO ACTION;
    END IF;
  END IF;
END $$;

-- 7) FK carga_car_tics -> vehiculos(nombre_clave) si no existe
DO $$
BEGIN
  IF to_regclass('public.carga_car_tics') IS NOT NULL AND to_regclass('public.vehiculos') IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'carga_car_tics_vehiculo_fkey' AND table_name = 'carga_car_tics') THEN
      ALTER TABLE carga_car_tics ADD CONSTRAINT carga_car_tics_vehiculo_fkey FOREIGN KEY (vehiculo) REFERENCES vehiculos(nombre_clave) ON DELETE NO ACTION ON UPDATE NO ACTION;
    END IF;
  END IF;
END $$;

-- 8) FK uso_car_tics -> vehiculos(nombre_clave) si no existe
DO $$
BEGIN
  IF to_regclass('public.uso_car_tics') IS NOT NULL AND to_regclass('public.vehiculos') IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'uso_car_tics_vehiculo_fkey' AND table_name = 'uso_car_tics') THEN
      ALTER TABLE uso_car_tics ADD CONSTRAINT uso_car_tics_vehiculo_fkey FOREIGN KEY (vehiculo) REFERENCES vehiculos(nombre_clave) ON DELETE NO ACTION ON UPDATE NO ACTION;
    END IF;
  END IF;
END $$;

-- 10) uso_car_tics.vehiculo NOT NULL solo si no hay nulls (evita error en Prisma Studio)
DO $$
BEGIN
  IF to_regclass('public.uso_car_tics') IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM uso_car_tics WHERE vehiculo IS NULL) AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='uso_car_tics' AND column_name='vehiculo') THEN
      ALTER TABLE uso_car_tics ALTER COLUMN vehiculo SET NOT NULL;
    END IF;
  END IF;
END $$;
