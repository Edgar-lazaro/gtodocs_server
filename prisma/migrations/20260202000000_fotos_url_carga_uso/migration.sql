-- AlterTable: carga_car_tics - cambiar fotos de bytea a text (URL)
-- Los datos existentes en bytea se pierden; las nuevas filas guardarán URLs.
ALTER TABLE "carga_car_tics" ALTER COLUMN "foto_km_bf" TYPE TEXT USING '';
ALTER TABLE "carga_car_tics" ALTER COLUMN "foto_km_af" TYPE TEXT USING '';
ALTER TABLE "carga_car_tics" ALTER COLUMN "foto_ticket" TYPE TEXT USING '';

-- AlterTable: uso_car_tics - cambiar fotos de bytea a text (URL)
ALTER TABLE "uso_car_tics" ALTER COLUMN "foto_km_inicial" TYPE TEXT USING NULL;
ALTER TABLE "uso_car_tics" ALTER COLUMN "foto_km_final" TYPE TEXT USING NULL;
