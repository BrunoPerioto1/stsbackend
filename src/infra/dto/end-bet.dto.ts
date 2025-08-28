import { IsEnum, IsArray, ArrayNotEmpty, IsNumber, IsNotEmpty } from 'class-validator';
import { ResultIdEnum } from './result-id.enum';

export class FinalizarApostaDto {
  @IsEnum(ResultIdEnum)
  @IsNotEmpty()
  resultId: ResultIdEnum;
}

export class FinalizarMultiplasDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsNumber({}, { each: true })
  @IsNotEmpty()
  apostaIds: number[];

  @IsEnum(ResultIdEnum)
  @IsNotEmpty()
  resultId: ResultIdEnum;
}
