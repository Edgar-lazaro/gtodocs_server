import { IsNumber, IsString, IsOptional } from 'class-validator';

export class GlpiValidationDto {
  @IsNumber()
  responsableId: number;

  @IsString()
  comentario: string;

  @IsOptional()
  @IsString()
  archivo?: string;
}
