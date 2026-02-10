import { PartialType } from '@nestjs/mapped-types';
import { CreateTareaAsignacionDto } from './create-tarea-asignacion.dto';

export class UpdateTareaAsignacionDto extends PartialType(
  CreateTareaAsignacionDto,
) {}
