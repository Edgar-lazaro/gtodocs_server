import { IsOptional, IsString, IsArray } from 'class-validator';

export class GlpiTaskDto {
  @IsString()
  descripcion: string;

  @IsOptional()
  @IsString()
  fechaLimite?: string;

  @IsOptional()
  @IsString()
  estatus?: string;

  @IsOptional()
  @IsArray()
  archivos?: string[];
}
