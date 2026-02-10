import { PartialType } from '@nestjs/mapped-types';
import { CreateInventarioTicsDto } from './create-inventario-tics.dto';

export class UpdateInventarioTicsDto extends PartialType(
  CreateInventarioTicsDto,
) {}
