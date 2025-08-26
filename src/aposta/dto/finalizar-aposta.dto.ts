import { IsEnum, IsArray, ArrayNotEmpty } from 'class-validator';
import { ResultIdEnum } from '../result-id.enum';

export class FinalizarApostaDto {
  @IsEnum(ResultIdEnum)
  resultId: ResultIdEnum;
}

export class FinalizarMultiplasDto {
  @IsArray()
  @ArrayNotEmpty()
  apostaIds: number[];

  @IsEnum(ResultIdEnum)
  resultId: ResultIdEnum;
}
