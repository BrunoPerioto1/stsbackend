import { IsNumber, IsString, IsPositive, IsNotEmpty, IsOptional } from 'class-validator';
import { Transform } from 'class-transformer';

export class UpdateApostaDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  game?: string;

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
  house?: string;

  @IsOptional()
  @IsNumber()
  house_id?: number;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  market?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  sport?: string;

  @IsOptional()
  @IsString()
  bet_time?: string;
}
