import { IsInt, IsOptional, IsString, Min } from 'class-validator';
import { Transform } from 'class-transformer';

export class CreateCargaCarTicsUploadDto {
  @IsString()
  operador!: string;

  @IsString()
  km_bf_carga!: string;

  @IsString()
  km_af_carga!: string;

  @IsString()
  vehiculo!: string;

  @IsOptional()
  @Transform(({ value }) =>
    value === undefined || value === '' ? undefined : Number(value),
  )
  @IsInt()
  @Min(1)
  gerenciaId?: number;
}
