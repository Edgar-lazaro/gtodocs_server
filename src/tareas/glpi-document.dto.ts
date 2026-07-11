import { IsString } from 'class-validator';

export class GlpiDocumentDto {
  @IsString()
  encabezado: string;
}
