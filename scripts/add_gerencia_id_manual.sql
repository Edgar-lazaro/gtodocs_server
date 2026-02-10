-- Script para agregar gerenciaId a carga_car_tics y uso_car_tics manualmente
-- Ejecutar en la base de datos donde tienes las tablas (ej: psql -d tu_bd -f scripts/add_gerencia_id_manual.sql)

-- Agregar columna a carga_car_tics (si no existe)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'carga_car_tics' AND column_name = 'gerenciaId'
  ) THEN
    ALTER TABLE "carga_car_tics" ADD COLUMN "gerenciaId" SMALLINT;
    ALTER TABLE "carga_car_tics" ADD CONSTRAINT "carga_car_tics_gerenciaId_fkey" 
      FOREIGN KEY ("gerenciaId") REFERENCES "gerencias"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
  END IF;
END $$;

-- Agregar columna a uso_car_tics (si no existe)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'uso_car_tics' AND column_name = 'gerenciaId'
  ) THEN
    ALTER TABLE "uso_car_tics" ADD COLUMN "gerenciaId" SMALLINT;
    ALTER TABLE "uso_car_tics" ADD CONSTRAINT "uso_car_tics_gerenciaId_fkey" 
      FOREIGN KEY ("gerenciaId") REFERENCES "gerencias"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
  END IF;
END $$;
