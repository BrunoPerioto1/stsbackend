import { IsNumber, IsString, IsPositive, IsNotEmpty, IsOptional } from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

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
  house_id?: number;

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
  bet_time?: string;
}
