import { IsEnum, IsArray, ArrayNotEmpty, IsNumber } from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { ResultIdEnum } from './result-id.enum';

export class FinalizarApostaDto {
  @ApiProperty({
    description: 'ID do resultado da aposta',
    enum: ResultIdEnum,
    example: ResultIdEnum.GANHOU,
    required: true
  })
  @IsEnum(ResultIdEnum)
  resultId: ResultIdEnum;
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
    example: ResultIdEnum.GANHOU,
    required: true
  })
  @IsEnum(ResultIdEnum)
  @Transform(({ value }) => Number(value))
  resultId: ResultIdEnum;
}
