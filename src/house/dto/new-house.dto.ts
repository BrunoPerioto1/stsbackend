import { IsString, IsNotEmpty, IsOptional, IsBoolean } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateHouseDto {
  @ApiProperty({
    description: 'Nome da casa de apostas',
    example: 'Bet365',
    required: true
  })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({
    description: 'Status ativo da casa de apostas',
    example: true,
    required: false,
    default: true
  })
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}