import { IsOptional, IsNumber, IsDate } from 'class-validator';
import { Type } from 'class-transformer';

export class BetFilterDto {
  @IsOptional()
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
  @IsNumber()
  resultId?: number;
}
