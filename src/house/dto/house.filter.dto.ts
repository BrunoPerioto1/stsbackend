import { IsOptional, IsNumber, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { BettingHouseId } from '../../db_types/BettingHouse';

export class HouseFilterRequestDto {
  @ApiProperty({ description: 'ID da casa de apostas para filtro', example: 1, required: false })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  houseId?: BettingHouseId;

  @ApiProperty({ description: 'Nome da casa de apostas para filtro (busca parcial)', example: 'Bet365', required: false })
  @IsOptional()
  @IsString()
  houseName?: string;
}