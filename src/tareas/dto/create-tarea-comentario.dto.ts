import { IsOptional, IsString } from 'class-validator';

export class CreateTareaComentarioDto {
  @IsOptional()
  @IsString()
  id?: string;

  @IsString()
  tareaId: string;

  @IsOptional()
  @IsString()
  usuarioId?: string;

  @IsString()
  mensaje: string;
}
