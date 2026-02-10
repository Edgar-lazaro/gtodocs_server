import { IsIn, IsString } from 'class-validator';

export class UpdateTareaEstadoDto {
  @IsString()
  id: string;

  @IsString()
  @IsIn(['pendiente', 'en_progreso', 'en_proceso', 'completada', 'cancelada'])
  estado:
    | 'pendiente'
    | 'en_progreso'
    | 'en_proceso'
    | 'completada'
    | 'cancelada';
}
