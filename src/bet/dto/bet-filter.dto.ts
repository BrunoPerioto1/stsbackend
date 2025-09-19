import { IsOptional, IsNumber, IsDate, IsString } from 'class-validator';
import { Type } from 'class-transformer';

export class BetFilterDto {

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  betId?: number;

  @IsOptional()
  @IsDate()
  @Type(() => Date)
  startDate?: Date;

  @IsOptional()
  @IsDate()
  @Type(() => Date)
  endDate?: Date;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  resultId?: number;
 
  @IsOptional()
  @IsString()
  q?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  userId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  perPage?: number;
}





