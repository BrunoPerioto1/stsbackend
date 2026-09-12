import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class SportDto {
  @ApiProperty({ description: 'ID do esporte', example: 1 })
  id!: number;

  @ApiProperty({ description: 'Nome canônico do esporte', example: 'Futebol' })
  name!: string;

  @ApiProperty({
    description: 'Variações de nome reconhecidas ao classificar apostas e tips',
    example: ['Soccer', 'Football'],
    type: [String],
  })
  aliases!: string[];

  @ApiPropertyOptional({ description: 'Esporte ativo', example: true })
  active?: boolean;
}
