import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsInt, IsDate, IsString, Min, Max } from 'class-validator';
import { Type, Transform } from 'class-transformer';

function toNumberArray({ value }: { value: unknown }) {
  if (typeof value !== 'string') return value;
  return value
    .split(',')
    .map((v) => v.trim())
    .filter((v) => v.length > 0)
    .map(Number)
    .filter((n) => !Number.isNaN(n));
}

export class BetFilterDto {
  @ApiPropertyOptional({ description: 'ID da aposta', type: Number, example: 123 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  betId?: number;

  @ApiPropertyOptional({ description: 'Data de início do período', example: '2024-01-01T00:00:00.000Z' })
  @IsOptional()
  @IsDate()
  @Type(() => Date)
  startDate?: Date;

  @ApiPropertyOptional({ description: 'Data de fim do período mostrado', example: '2024-01-31T23:59:59.000Z' })
  @IsOptional()
  @IsDate()
  @Type(() => Date)
  endDate?: Date;

  @ApiPropertyOptional({ description: 'ID do resultado da aposta', example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  resultId?: number;

  @ApiPropertyOptional({
    description: 'IDs de resultado (múltipla seleção), separados por vírgula',
    type: String,
    example: '1,2',
  })
  @IsOptional()
  @Transform(toNumberArray)
  @IsInt({ each: true })
  resultIds?: number[];

  @ApiPropertyOptional({
    description: 'IDs de casa de aposta (múltipla seleção), separados por vírgula',
    type: String,
    example: '3,7',
  })
  @IsOptional()
  @Transform(toNumberArray)
  @IsInt({ each: true })
  houseIds?: number[];

  @ApiPropertyOptional({ description: 'Busca textual (jogo, mercado ou esporte)', type: String })
  @IsOptional()
  @IsString()
  q?: string;

  @ApiPropertyOptional({ description: 'ID do usuário dono das apostas', example: 42 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  userId?: number;

  @ApiPropertyOptional({ description: 'Número da página atual', type: Number, default: 1, example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @ApiPropertyOptional({ description: 'Número de resultados por página', type: Number, default: 30, example: 30 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000)
  perPage = 30;
}
