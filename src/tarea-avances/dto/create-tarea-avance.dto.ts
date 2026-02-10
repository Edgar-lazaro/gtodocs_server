import {
  IsArray,
  IsDateString,
  IsNumberString,
  IsOptional,
  IsString,
} from 'class-validator';

export class CreateTareaAvanceDto {
  @IsNumberString()
  tarea_id!: string;

  @IsString()
  usuario_id!: string;

  @IsOptional()
  @IsString()
  descripcion?: string;

  @IsArray()
  @IsString({ each: true })
  imagenes!: string[];

  @IsOptional()
  @IsDateString()
  fecha_creacion?: string;
}
