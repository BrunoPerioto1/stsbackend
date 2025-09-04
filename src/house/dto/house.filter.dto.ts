import { IsOptional, IsNumber, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class HouseFilterDto {
  @ApiProperty({ description: 'ID da casa de apostas para filtro', example: 1, required: false })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  houseId?: number;

  @ApiProperty({ description: 'Nome da casa de apostas para filtro (busca parcial)', example: 'Bet365', required: false })
  @IsOptional()
  @IsString()
  houseName?: string;
}