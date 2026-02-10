import { IsInt, IsOptional, IsString, Min } from 'class-validator';
import { Transform } from 'class-transformer';

/** Body para POST /uso-car-tics/upload (foto_km_inicial y foto_km_final vienen como archivos) */
export class CreateUsoCarTicsUploadDto {
  @IsString()
  vehiculo!: string;

  @IsString()
  conductor!: string;

  @IsString()
  destino!: string;

  @IsString()
  hora_inicio!: string;

  @IsString()
  nivel_combustible!: string;

  @IsString()
  kilometraje_inicial!: string;

  @IsString()
  hora_final!: string;

  @IsString()
  kilometraje_final!: string;

  @IsOptional()
  @Transform(({ value }) =>
    value === undefined || value === '' ? undefined : Number(value),
  )
  @IsInt()
  @Min(1)
  gerenciaId?: number;
}
