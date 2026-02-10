import { IsNumberString, IsOptional, IsString, IsUUID } from 'class-validator';

export class CreateCombustibleUploadDto {
  @IsString()
  hora_ini!: string;

  @IsString()
  hora_final!: string;

  @IsOptional()
  @IsUUID()
  nombre?: string;

  @IsNumberString()
  km_inicio!: string;

  @IsNumberString()
  lvl_km_ini!: string;

  @IsString()
  destino!: string;

  @IsOptional()
  @IsString()
  vehiculo?: string;

  @IsNumberString()
  km_final!: string;

  @IsNumberString()
  lvl_km_fin!: string;
}
