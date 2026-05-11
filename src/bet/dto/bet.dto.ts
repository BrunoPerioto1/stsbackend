import { IsNumber, IsString, IsPositive, IsNotEmpty, IsOptional, IsArray, ArrayNotEmpty, IsEnum, } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose, Transform, Type } from 'class-transformer';
import { ResultIdEnum } from './result-id.enum';

export class CreateBetRequestDto {
  
  @ApiProperty({  
    description: 'Game or sporting event name',
    example: 'Flamengo vs Palmeiras',
    required: true
  })
  @IsString()
  @IsNotEmpty()
  game: string;

  @ApiProperty({
    description: 'Bet stake amount',
    example: 50.00,
    required: true
  })
  @IsNumber()
  @IsPositive()
  stake: number;

  @ApiProperty({
    description: 'Bet odds',
    example: 2.50,
    required: true
  })
  @IsNumber()
  @IsPositive()
  odd: number;

  @ApiProperty({
    description: 'Sportsbook ID',
    example: 1,
    required: false
  })
  @IsOptional()
  @IsNumber()
  houseId?: number;

  @ApiProperty({
    description: 'Betting market',
    example: 'Match result',
    required: true
  })
  @IsString()
  @IsNotEmpty()
  market: string;

  @ApiProperty({
    description: 'Sport',
    example: 'Soccer',
    required: true
  })
  @IsString()
  @IsNotEmpty()
  sport: string;

  @ApiProperty({
    description: 'Bet date and time (optional)',
    example: '2024-01-15T20:00:00Z',
    required: false
  })
  @IsOptional()
  @IsString()
  betTime?: string;

  @ApiProperty({
    description: 'User ID who placed the bet',
    required: true
  })
  @IsNumber()
  @IsNotEmpty()
  userId: number;
}

export class UpdateApostaDto {
  @ApiProperty({
    description: 'Nome do jogo ou evento esportivo',
    example: 'Flamengo vs Palmeiras',
    required: false
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  game?: string;

  @ApiProperty({
    description: 'Valor da aposta',
    example: 50.00,
    required: false
  })
  @IsOptional()
  @Transform(({ value }) => value === '' ? undefined : Number(value))
  @IsNumber()
  @IsPositive()
  stake?: number;

  @ApiProperty({
    description: 'Odd da aposta',
    example: 2.50,
    required: false
  })
  @IsOptional()
  @Transform(({ value }) => value === '' ? undefined : Number(value))
  @IsNumber()
  @IsPositive()
  odd?: number;

  @ApiProperty({
    description: 'Nome da casa de apostas',
    example: 'Bet365',
    required: false
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  house?: string;

  @ApiProperty({
    description: 'ID da casa de apostas',
    example: 1,
    required: false
  })
  @IsOptional()
  @IsNumber()
  houseId?: number;

  @ApiProperty({
    description: 'Mercado da aposta',
    example: 'Resultado Final',
    required: false
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  market?: string;

  @ApiProperty({
    description: 'Esporte da aposta',
    example: 'Futebol',
    required: false
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  sport?: string;

  @ApiProperty({
    description: 'Data e hora da aposta',
    example: '2024-01-15T20:00:00Z',
    required: false
  })
  @IsOptional()
  @IsString()
  betTime?: string;
}

export class FinalizarApostaDto {
  @ApiProperty({
    description: 'ID do resultado da aposta',
    enum: ResultIdEnum,
    example: ResultIdEnum.WON,
    required: true
  })
  @IsEnum(ResultIdEnum)
  resultId: ResultIdEnum;
}

export class DeleteMultipleBetsDto {
  @ApiProperty({
    description: 'Array de IDs das apostas a serem deletadas',
    example: [1, 2, 3],
    required: true,
    type: [Number]
  })
  @IsArray()
  @ArrayNotEmpty()
  @IsNumber({}, { each: true })
  @Transform(({ value }) => Array.isArray(value) ? value.map(id => Number(id)) : value)
  betIds: number[];
}
export class FinalizarMultiplasDto {
  @ApiProperty({
    description: 'Array de IDs das apostas a serem finalizadas',
    example: [1, 2, 3],
    required: true,
    type: [Number]
  })
  @IsArray()
  @ArrayNotEmpty()
  @IsNumber({}, { each: true })
  @Transform(({ value }) => Array.isArray(value) ? value.map(id => Number(id)) : value)
  betIds: number[];

  @ApiProperty({
    description: 'ID do resultado das apostas',
    enum: ResultIdEnum,
    example: ResultIdEnum.WON,
    required: true
  })
  @IsEnum(ResultIdEnum)
  @Transform(({ value }) => Number(value))
  resultId: ResultIdEnum;
}

export class BetItem {
  @ApiProperty({ description: 'ID único da aposta' })
  id: number;

  @ApiProperty({ description: 'Nome do jogo ou evento' })
  game: string;

  @ApiProperty({ description: 'Valor apostado' })
  stake: number;

  @ApiProperty({ description: 'Cotação da aposta' })
  odd: number;

  @ApiProperty({ description: 'ID da casa de apostas', nullable: true })
  houseId: number | null;

  @ApiProperty({ description: 'Mercado da aposta (ex: "Resultado Final", "Over/Under")' })
  market: string;

  @ApiProperty({ description: 'Esporte da aposta (ex: "Futebol", "Tênis")' })
  sport: string;

  @ApiProperty({ description: 'Lucro ou prejuízo da aposta' })
  profit: number | null;

  @ApiProperty({ description: 'Data e hora da aposta' })
  betTime: Date;

  @ApiPropertyOptional({ description: 'ID do resultado da aposta' })
  resultId?: number;

  @ApiPropertyOptional({ description: 'Nome do resultado (WON, LOST, PENDING, etc.)' })
  resultName?: string;
}


export class PaginatedBetsResponseDto {
  @ApiPropertyOptional({ description: "Número total de páginas", example: 10 })
  totalPages?: number;

  @ApiProperty({ description: "Total de registros", example: 125 })
  total?: number;

  @ApiPropertyOptional({
    type: [BetItem],
    description: "Lista de apostas",
    isArray: true
  })
  @Type(() => BetItem)
  data?: BetItem[];
}

export { CreateBetRequestDto as CreateBetDto };
