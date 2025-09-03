import { IsNumber, IsString, IsPositive, IsNotEmpty, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateBetDto {
  @ApiProperty({
    description: 'Nome do jogo ou evento esportivo',
    example: 'Flamengo vs Palmeiras',
    required: true
  })
  @IsString()
  @IsNotEmpty()
  game: string;

  @ApiProperty({
    description: 'Valor da aposta',
    example: 50.00,
    required: true
  })
  @IsNumber()
  @IsPositive()
  stake: number;

  @ApiProperty({
    description: 'Odd da aposta',
    example: 2.50,
    required: true
  })
  @IsNumber()
  @IsPositive()
  odd: number;

  @ApiProperty({
    description: 'ID da casa de apostas (opcional)',
    example: 1,
    required: false
  })
  @IsOptional()
  @IsNumber()
  house_id?: number;

  @ApiProperty({
    description: 'Mercado da aposta',
    example: 'Resultado Final',
    required: true
  })
  @IsString()
  @IsNotEmpty()
  market: string;

  @ApiProperty({
    description: 'Esporte da aposta',
    example: 'Futebol',
    required: true
  })
  @IsString()
  @IsNotEmpty()
  sport: string;

  @ApiProperty({
    description: 'Data e hora da aposta (opcional)',
    example: '2024-01-15T20:00:00Z',
    required: false
  })
  @IsOptional()
  @IsString()
  bet_time?: string;
}
