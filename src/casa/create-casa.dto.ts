import { IsString, IsNotEmpty, IsOptional, IsBoolean } from 'class-validator';

export class CreateCasaDto {
  @IsString()
  @IsNotEmpty()
  nome: string;

  @IsString()
  @IsNotEmpty()
  slug: string;

  @IsOptional()
  @IsBoolean()
  ativo?: boolean;
}