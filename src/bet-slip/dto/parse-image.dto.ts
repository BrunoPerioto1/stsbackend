import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class ParseImageBodyDto {
  @ApiPropertyOptional({
    description:
      'Casa já escolhida no formulário. Quando vem, é usada no lugar da logo lida do print.',
    example: 'KTO',
  })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  houseHint?: string;
}

export class MatchedTipDto {
  @ApiProperty() tipId!: number;
  @ApiProperty({ description: 'Score de 0 a 1 do matching local (sem IA).' })
  score!: number;
  @ApiProperty() event!: string;
  @ApiProperty() market!: string;
  @ApiProperty({ nullable: true }) odd!: number | null;
  @ApiProperty({ nullable: true }) stake!: number | null;
  @ApiProperty() at!: string;
}

export class ParsedHouseDto {
  @ApiProperty() id!: number;
  @ApiProperty() name!: string;
}

export class ParsedBetSlipDto {
  @ApiProperty({ nullable: true }) event!: string | null;
  @ApiProperty({ nullable: true }) market!: string | null;
  @ApiProperty({ nullable: true }) sport!: string | null;
  @ApiProperty({ type: ParsedHouseDto, nullable: true })
  house!: ParsedHouseDto | null;
  @ApiProperty({ nullable: true, description: 'Odd final (já com boost).' })
  odd!: number | null;
  @ApiProperty({
    nullable: true,
    description: 'Odd antes do boost; null quando não houve boost.',
  })
  originalOdd!: number | null;
  @ApiProperty({ nullable: true }) stake!: number | null;
  @ApiProperty({
    description:
      'Heurística de 0 a 1 por campo — não é probabilidade do modelo. Só orienta o que o app marca para conferência.',
    example: { event: 0.9, market: 0.55 },
  })
  confidence!: Record<string, number>;
  @ApiProperty({ type: [MatchedTipDto] })
  matchedTips!: MatchedTipDto[];
}
