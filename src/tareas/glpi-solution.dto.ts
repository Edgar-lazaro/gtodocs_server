import { IsString, IsIn, IsOptional } from 'class-validator';

export class GlpiSolutionDto {
  @IsString()
  contenido: string;

  @IsString()
  @IsIn(['realizada', 'cancelada', 'propuesta'])
  estatus: 'realizada' | 'cancelada' | 'propuesta';

  @IsOptional()
  @IsString()
  archivo?: string;
}
