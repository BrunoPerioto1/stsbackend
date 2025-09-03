import { IsOptional, IsISO8601, IsNumber, IsPositive } from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export class DashboardQueryDto {
  @ApiProperty({
    description: 'ID da casa de apostas para filtrar os dados',
    example: 1,
    required: false
  })
  @IsOptional()
  @IsNumber()
  @IsPositive()
  @Transform(({ value }) => value ? Number(value) : undefined)
  house_id?: number;

  @ApiProperty({
    description: 'Data de início para filtrar os dados do dashboard',
    example: '2024-01-01T00:00:00Z',
    required: false
  })
  @IsOptional()
  @IsISO8601()
  @Transform(({ value }) => value ? new Date(value).toISOString() : undefined)
  startDate?: string;

  @ApiProperty({
    description: 'Data de fim para filtrar os dados do dashboard',
    example: '2024-12-31T23:59:59Z',
    required: false
  })
  @IsOptional()
  @IsISO8601()
  @Transform(({ value }) => value ? new Date(value).toISOString() : undefined)
  endDate?: string;
}
