import { ApiProperty } from '@nestjs/swagger';
import { ArrayNotEmpty, IsArray, IsInt } from 'class-validator';
import { ResultIdEnum } from '../../bet/dto/result-id.enum';

export class ConfirmSettlementDto {
  @ApiProperty({
    description: 'Apostas cujas sugestões o usuário aceitou.',
    example: [12, 15, 18],
    type: [Number],
  })
  @IsArray()
  @ArrayNotEmpty()
  @IsInt({ each: true })
  betIds!: number[];
}

export class SettlementSuggestionDto {
  @ApiProperty({ example: 12 })
  betId!: number;

  @ApiProperty({ example: 'Flamengo x Palmeiras' })
  game!: string;

  @ApiProperty({ example: 'Mais de 2.5 - Total de gols' })
  market!: string;

  @ApiProperty({ example: 50 })
  stake!: number;

  @ApiProperty({ example: 1.85 })
  odd!: number;

  @ApiProperty({
    example: '2026-09-09T21:30:00.000Z',
    nullable: true,
    description:
      'Horário do jogo, quando o matching achou o evento. A tela ordena por ' +
      'ele para o usuário conferir na ordem em que os jogos acabaram.',
  })
  eventStartAt!: Date | null;

  @ApiProperty({
    enum: ResultIdEnum,
    example: ResultIdEnum.WON,
    description: 'Resultado proposto. Só vira oficial após confirmação.',
  })
  suggestedResultId!: ResultIdEnum;

  @ApiProperty({
    example: '3 gols no jogo, mais de 2.5',
    description: 'Como o sistema chegou nesse resultado.',
  })
  explanation!: string;

  @ApiProperty({ example: 2, nullable: true })
  homeScore!: number | null;

  @ApiProperty({ example: 1, nullable: true })
  awayScore!: number | null;
}
