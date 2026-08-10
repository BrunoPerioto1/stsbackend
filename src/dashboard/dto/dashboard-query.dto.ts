import { IsOptional, IsISO8601, IsNumber, IsPositive } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { BettingHouseId } from '../../db_types/BettingHouse';

export class DashboardQueryDto {
  @ApiProperty({
    description: 'ID da casa de apostas para filtrar os dados',
    example: 1,
    required: false
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  houseId?: BettingHouseId;

  @ApiProperty({
    description: 'Data de início para filtrar os dados do dashboard',
    example: '2024-01-01T00:00:00Z',
    required: false
  })
  @IsOptional()
  @IsISO8601()
  startDate?: string;

  @ApiProperty({
    description: 'Data de fim para filtrar os dados do dashboard',
    example: '2024-12-31T23:59:59Z',
    required: false
  })
  @IsOptional()
  @IsISO8601()
  endDate?: string;
}
