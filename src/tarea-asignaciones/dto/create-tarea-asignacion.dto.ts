import {
  IsDateString,
  IsNumberString,
  IsOptional,
  IsString,
} from 'class-validator';

export class CreateTareaAsignacionDto {
  @IsNumberString()
  tarea_id!: string;

  @IsString()
  usuario_id!: string;

  @IsOptional()
  @IsDateString()
  fecha_asignacion?: string;
}
