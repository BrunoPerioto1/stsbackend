import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsInt, IsString } from 'class-validator';
import { Type } from 'class-transformer';
import { BettingHouseId } from '../../db_types/BettingHouse';

export class HouseFilterRequestDto {
  @ApiPropertyOptional({ description: 'ID da casa de apostas para filtro', type: Number, example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  houseId?: BettingHouseId;

  @ApiPropertyOptional({ description: 'Nome da casa de apostas para filtro (busca parcial)', type: String, example: 'Bet365' })
  @IsOptional()
  @IsString()
  houseName?: string;
}
