import { applyDecorators } from '@nestjs/common';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsInt, IsOptional } from 'class-validator';
import { toNumberArray } from '../utils/dto-transform.util';

// Filtro opcional de múltipla seleção por id na query string ("3,7"): os
// filtros de apostas, dashboard e tips repetiam os mesmos quatro decorators.
export function IdListQuery(description: string, example: string) {
  return applyDecorators(
    ApiPropertyOptional({ description, type: String, example }),
    IsOptional(),
    Transform(toNumberArray),
    IsInt({ each: true }),
  );
}
