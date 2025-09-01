import { IsEnum, IsArray, ArrayNotEmpty, IsNumber, IsNotEmpty } from 'class-validator';
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
  @IsNotEmpty()
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
  @IsNotEmpty()
  apostaIds: number[];

  @ApiProperty({
    description: 'ID do resultado das apostas',
    enum: ResultIdEnum,
    example: ResultIdEnum.GANHOU,
    required: true
  })
  @IsEnum(ResultIdEnum)
  @IsNotEmpty()
  resultId: ResultIdEnum;
}
