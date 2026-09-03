import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsISO8601, IsInt, IsPositive } from 'class-validator';
import { Type } from 'class-transformer';
import { BettingHouseId } from '../../db_types/BettingHouse';

export class DashboardQueryDto {
  @ApiPropertyOptional({
    description: 'ID da casa de apostas para filtrar os dados',
    type: Number,
    example: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  houseId?: BettingHouseId;

  @ApiPropertyOptional({
    description: 'Data de início para filtrar os dados do dashboard',
    type: String,
    example: '2024-01-01T00:00:00Z',
  })
  @IsOptional()
  @IsISO8601()
  startDate?: string;

  @ApiPropertyOptional({
    description: 'Data de fim para filtrar os dados do dashboard',
    type: String,
    example: '2024-12-31T23:59:59Z',
  })
  @IsOptional()
  @IsISO8601()
  endDate?: string;
}

// Estende a query de métricas com o período anterior, pra comparação de KPIs
// (ex.: "vs. período anterior" no dashboard) sair numa única chamada em vez
// de duas — o front antes batia /metrics duas vezes (atual e anterior).
export class DashboardMetricsComparisonQueryDto extends DashboardQueryDto {
  @ApiPropertyOptional({
    description: 'Data de início do período anterior, para comparação',
    type: String,
    example: '2023-12-01T00:00:00Z',
  })
  @IsOptional()
  @IsISO8601()
  previousStartDate?: string;

  @ApiPropertyOptional({
    description: 'Data de fim do período anterior, para comparação',
    type: String,
    example: '2023-12-31T23:59:59Z',
  })
  @IsOptional()
  @IsISO8601()
  previousEndDate?: string;
}
