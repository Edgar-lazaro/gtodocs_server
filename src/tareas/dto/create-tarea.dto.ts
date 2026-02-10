import { IsDateString, IsIn, IsOptional, IsString } from 'class-validator';

export class CreateTareaDto {
  @IsString()
  titulo: string;

  @IsOptional()
  @IsString()
  descripcion?: string;

  @IsString()
  usuario_asignado: string;

  @IsOptional()
  @IsIn(['pendiente', 'en_progreso', 'completada', 'cancelada'])
  estatus?: 'pendiente' | 'en_progreso' | 'completada' | 'cancelada';

  @IsOptional()
  @IsDateString()
  fecha_limite?: string;
}
