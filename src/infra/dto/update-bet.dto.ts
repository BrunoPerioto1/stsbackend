import { IsNumber, IsString, IsPositive, IsNotEmpty, IsOptional } from 'class-validator';
import { Transform } from 'class-transformer';

export class UpdateApostaDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  jogo?: string;

  @IsOptional()
  @Transform(({ value }) => value === '' ? undefined : Number(value))
  @IsNumber()
  @IsPositive()
  stake?: number;

  @IsOptional()
  @Transform(({ value }) => value === '' ? undefined : Number(value))
  @IsNumber()
  @IsPositive()
  odd?: number;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  casa?: string;

  @IsOptional()
  @IsNumber()
  casa_id?: number;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  mercado?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  esporte?: string;

  @IsOptional()
  @IsString()
  data_hora?: string;
}
