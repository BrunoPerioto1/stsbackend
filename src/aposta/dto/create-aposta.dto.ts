import { IsNumber, IsString, IsPositive, IsNotEmpty, IsOptional } from 'class-validator';

export class CreateApostaDto {
  @IsString()
  @IsNotEmpty()
  jogo: string;

  @IsNumber()
  @IsPositive()
  stake: number;

  @IsNumber()
  @IsPositive()
  odd: number;

  @IsString()
  @IsNotEmpty()
  casa: string;

  @IsOptional()
  @IsNumber()
  casa_id?: number;

  @IsString()
  @IsNotEmpty()
  mercado: string;

  @IsString()
  @IsNotEmpty()
  esporte: string;

  @IsOptional()
  @IsString()
  data_hora?: string;
}
