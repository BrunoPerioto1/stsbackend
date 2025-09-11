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
  market?: string;
}
