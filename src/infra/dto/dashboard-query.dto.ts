import { IsOptional, IsISO8601 } from 'class-validator';
import { Transform } from 'class-transformer';

export class DashboardQueryDto {
  @IsOptional()
  @IsISO8601()
  @Transform(({ value }) => value ? new Date(value).toISOString() : undefined)
  startDate?: string;

  @IsOptional()
  @IsISO8601()
  @Transform(({ value }) => value ? new Date(value).toISOString() : undefined)
  endDate?: string;
}
