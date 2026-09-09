import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsInt, IsNumber, IsOptional, IsPositive, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';

export const TIP_STATUSES = ['pending', 'planilhada', 'caiu'] as const;
export type TipStatus = (typeof TIP_STATUSES)[number];

export class TipFilterDto {
  @ApiPropertyOptional({
    description: 'Filtra por situação da tip para o usuário logado',
    enum: TIP_STATUSES,
  })
  @IsOptional()
  @IsIn(TIP_STATUSES)
  status?: TipStatus;

  @ApiPropertyOptional({ type: Number, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @ApiPropertyOptional({ type: Number, default: 30 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  perPage = 30;
}

// Todos opcionais: sem nada no corpo, planilha exatamente como o bot faria.
// O "Editar" da tela manda só o que o usuário mexeu.
export class PlanilharTipDto {
  @ApiPropertyOptional({ description: 'Valor apostado, se diferente do sugerido' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  stake?: number;

  @ApiPropertyOptional({ description: 'Odd real pega na casa, se mudou' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1.01)
  odd?: number;

  @ApiPropertyOptional({ description: 'Casa, quando a da tip não foi reconhecida' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  houseId?: number;
}

export class TipItemDto {
  @ApiProperty()
  id!: number;

  @ApiProperty({ description: 'Quando a tip chegou do canal' })
  createdAt!: Date;

  @ApiProperty({ enum: TIP_STATUSES })
  status!: TipStatus;

  @ApiProperty({
    nullable: true,
    description: 'Aposta já planilhada a partir desta tip',
  })
  betId!: number | null;

  @ApiProperty({ nullable: true })
  house!: string | null;

  @ApiProperty({ nullable: true })
  game!: string | null;

  @ApiProperty({ nullable: true })
  sport!: string | null;

  @ApiProperty({ nullable: true })
  market!: string | null;

  @ApiProperty({ nullable: true })
  odd!: number | null;

  @ApiProperty({ nullable: true, description: 'Valor (EV) informado pelo canal' })
  percent!: number | null;

  @ApiProperty({ nullable: true, description: 'Limite da aposta sugerido' })
  limit!: number | null;

  @ApiProperty({
    nullable: true,
    description: 'Stake recomendada para este usuário (banca × % da tip, limitada pelo 🚦)',
  })
  recommendedStake!: number | null;

  @ApiProperty({ nullable: true, description: 'Lucro se a aposta ganhar na stake recomendada' })
  potentialProfit!: number | null;

  @ApiProperty({ nullable: true, description: 'Link da aposta na casa' })
  link!: string | null;

  @ApiProperty({ description: 'Mensagem de SOBRECARGA/AVISO' })
  isAviso!: boolean;

  @ApiProperty({ description: 'Mensagem do Telegram como o usuário a recebeu' })
  text!: string;
}

export class TipsSummaryDto {
  @ApiProperty()
  pending!: number;

  @ApiProperty()
  planilhadas!: number;

  @ApiProperty()
  caidas!: number;

  @ApiProperty({ description: 'Soma das stakes recomendadas das tips pendentes' })
  pendingStake!: number;
}

export class TipsListResponseDto {
  @ApiProperty({ type: [TipItemDto] })
  data!: TipItemDto[];

  @ApiProperty({ type: TipsSummaryDto })
  summary!: TipsSummaryDto;

  @ApiProperty({ description: 'Total de tips na aba pedida, antes da paginação' })
  total!: number;

  @ApiProperty()
  page!: number;

  @ApiProperty()
  perPage!: number;
}
