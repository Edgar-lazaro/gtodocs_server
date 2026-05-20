-- Add maintenance tracking fields to vehiculos
ALTER TABLE "vehiculos" ADD COLUMN IF NOT EXISTS "km_ultimo_mantenimiento" DECIMAL;
ALTER TABLE "vehiculos" ADD COLUMN IF NOT EXISTS "km_mantenimiento_cada" DECIMAL;
