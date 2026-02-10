-- Agregar columna vehiculo a uso_car_tics (referencia a vehiculos.nombre_clave)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'uso_car_tics' AND column_name = 'vehiculo'
  ) THEN
    ALTER TABLE "uso_car_tics" ADD COLUMN "vehiculo" TEXT;
    -- FK solo si existe la tabla vehiculos y tiene nombre_clave
    IF to_regclass('public.vehiculos') IS NOT NULL THEN
      ALTER TABLE "uso_car_tics" ADD CONSTRAINT "uso_car_tics_vehiculo_fkey"
        FOREIGN KEY ("vehiculo") REFERENCES "vehiculos"("nombre_clave") ON DELETE NO ACTION ON UPDATE NO ACTION;
    END IF;
  END IF;
END $$;
