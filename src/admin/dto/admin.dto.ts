import { ApiProperty, PartialType } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
} from 'class-validator';

// Os dois papéis em uso: 1 admin, 3 usuário. O 2 (moderator) continua na tabela
// `roles` mas ninguém nunca esteve nele e nenhuma regra do sistema o consulta —
// oferecer na tela era convidar a criar um papel sem significado.
//
// IsIn em vez de IsInt: roleId 7 não é erro de digitação, é usuário com papel
// órfão que ninguém consegue arrumar pela tela depois.
export const ROLE_IDS = [1, 3] as const;

export class UpdateAdminUserDTO {
  @ApiProperty({
    required: false,
    enum: ROLE_IDS,
    description: '1 admin, 3 usuário',
  })
  @IsOptional()
  @IsIn(ROLE_IDS as unknown as number[])
  roleId?: number;

  @ApiProperty({
    required: false,
    description: 'Zera o bloqueio por tentativas de login',
  })
  @IsOptional()
  @IsBoolean()
  unlock?: boolean;

  @ApiProperty({
    required: false,
    description: 'Desvincula a conta do Telegram',
  })
  @IsOptional()
  @IsBoolean()
  unlinkTelegram?: boolean;

  @ApiProperty({
    required: false,
    description: 'Soma dias ao acesso (a partir de hoje se já venceu)',
    example: 30,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(366)
  extendDays?: number;

  // null tira o prazo (volta a "sem prazo"); ausente não mexe.
  @ApiProperty({
    required: false,
    nullable: true,
    type: String,
    description: 'Vencimento exato em ISO 8601 com fuso; null = sem prazo',
    example: '2026-10-24T23:30:00-03:00',
  })
  @IsOptional()
  @IsDateString({ strict: true })
  accessUntil?: string | null;

  @ApiProperty({
    required: false,
    enum: ['remove', 'invite'],
    description:
      'remove: tira do grupo Tips quem está sem acesso (ban). invite: manda de novo o convite a quem está em dia e ficou de fora',
  })
  @IsOptional()
  @IsIn(['remove', 'invite'])
  tipsGroup?: 'remove' | 'invite';
}

export class CreateAdminHouseDTO {
  @ApiProperty({ example: 'Bet365' })
  @IsString()
  @MinLength(2)
  name!: string;

  @ApiProperty({
    required: false,
    type: [String],
    description: 'Variações de nome que o parser de tips deve reconhecer',
    example: ['Bet 365', 'bet365 brasil'],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  aliases?: string[];

  @ApiProperty({
    required: false,
    nullable: true,
    description:
      'Site da casa, só domínio .bet.br (federal). Vazio ou null apaga o link.',
    example: 'https://betano.bet.br',
  })
  @IsOptional()
  @IsString()
  websiteUrl?: string | null;
}

export class UpdateAdminHouseDTO extends PartialType(CreateAdminHouseDTO) {
  @ApiProperty({
    required: false,
    description: 'Casa inativa some das listas de seleção',
  })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
