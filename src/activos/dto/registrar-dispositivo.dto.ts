import { IsIn, IsInt, IsOptional, IsString, Min } from 'class-validator';

export class RegistrarDispositivoDto {
  @IsIn(['android', 'ios', 'ipados'])
  os: 'android' | 'ios' | 'ipados';

  // Minimos para dar de alta (validados tambien en el frontend, pero
  // nunca se confia solo en eso): sin serial no hay forma de deduplicar.
  @IsString()
  serial: string;

  @IsOptional()
  @IsString()
  uuid?: string;

  @IsOptional()
  @IsString()
  imei?: string;

  @IsOptional()
  @IsString()
  modelo?: string;

  @IsOptional()
  @IsString()
  fabricante?: string;

  @IsOptional()
  @IsString()
  nombre?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  ramMb?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  almacenamientoTotalMb?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  almacenamientoLibreMb?: number;

  @IsOptional()
  @IsString()
  macWifi?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  bateriaNivel?: number;

  @IsOptional()
  @IsString()
  numeroTelefono?: string;

  @IsOptional()
  @IsString()
  numeroEmpleado?: string;

  @IsOptional()
  @IsInt()
  usuarioId?: number;

  @IsOptional()
  @IsString()
  so?: string;

  @IsOptional()
  @IsString()
  soVersion?: string;

  @IsOptional()
  @IsString()
  comentarioExtra?: string;
}
