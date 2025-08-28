import { IsNumber, IsString, IsPositive, IsNotEmpty, IsOptional } from 'class-validator';

export class CreateBetDto {
  @IsString()
  @IsNotEmpty()
  game: string;

  @IsNumber()
  @IsPositive()
  stake: number;

  @IsNumber()
  @IsPositive()
  odd: number;

  @IsOptional()
  @IsNumber()
  house_id?: number;

  @IsString()
  @IsNotEmpty()
  market: string;

  @IsString()
  @IsNotEmpty()
  sport: string;

  @IsOptional()
  @IsString()
  bet_time?: string;
}
