import { IsInt, IsNumberString, IsOptional, IsString } from 'class-validator';

export class CreateInventarioTicsDto {
  @IsString()
  nombre!: string;

  @IsOptional()
  @IsString()
  descripcion?: string;

  @IsOptional()
  @IsInt()
  cantidad?: number;

  @IsOptional()
  @IsNumberString()
  precio?: string;

  @IsOptional()
  @IsString()
  categoria?: string;

  @IsOptional()
  @IsString()
  estado?: string;

  @IsOptional()
  @IsString()
  ubicacion?: string;

  @IsOptional()
  @IsInt()
  gerencia?: number;

  @IsOptional()
  @IsNumberString()
  jefatura?: string;

  @IsOptional()
  @IsString()
  img?: string;
}
