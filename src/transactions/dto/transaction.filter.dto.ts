import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsDateString, IsInt } from 'class-validator';
import { Type } from 'class-transformer';

export class TransactionFilterDto {
  @ApiPropertyOptional({ description: 'Data inicial do período', type: String, example: '2025-09-03' })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({ description: 'Data final do período', type: String, example: '2025-09-04' })
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiPropertyOptional({ description: 'ID da casa de apostas para filtro', type: Number, example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  houseId?: number;

  @ApiPropertyOptional({ description: 'ID do usuário dono das transações', type: Number, example: 42 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  userId?: number;
}
