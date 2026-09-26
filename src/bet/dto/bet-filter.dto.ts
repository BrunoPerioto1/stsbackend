import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsInt, IsDate, IsString, Min, Max, IsIn, IsBoolean } from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { toNumberArray, toStringArray } from '../../common/utils/dto-transform.util';

// De onde a aposta veio: botão Planilhar de uma tip (tem tip_id), mensagem
// avulsa pro bot, print lido no site, ou digitada à mão no site.
export const BET_ORIGINS = ['tip', 'telegram', 'print', 'manual'] as const;
export type BetOriginFilter = (typeof BET_ORIGINS)[number];

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

  @ApiPropertyOptional({
    description: 'IDs de esporte (múltipla seleção), separados por vírgula',
    type: String,
    example: '1,4',
  })
  @IsOptional()
  @Transform(toNumberArray)
  @IsInt({ each: true })
  sportIds?: number[];

  @ApiPropertyOptional({
    description: 'Origem (múltipla seleção), separada por vírgula: tip, telegram, print, manual',
    type: String,
    example: 'tip,telegram',
  })
  @IsOptional()
  @Transform(toStringArray)
  @IsIn(BET_ORIGINS, { each: true })
  origins?: BetOriginFilter[];

  @ApiPropertyOptional({
    description: 'Só apostas sem jogo identificado (sem casamento de evento)',
    type: Boolean,
  })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  unmatched?: boolean;

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
