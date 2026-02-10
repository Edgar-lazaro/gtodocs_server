import { PartialType } from '@nestjs/mapped-types';
import { CreateInventarioManttoDto } from './create-inventario-mantto.dto';

export class UpdateInventarioManttoDto extends PartialType(
  CreateInventarioManttoDto,
) {}
