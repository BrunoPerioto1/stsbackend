import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsOptional } from 'class-validator';

// Os papéis que existem em `roles`. IsIn em vez de IsInt: roleId 7 não é erro
// de digitação, é usuário com papel órfão que ninguém consegue arrumar pela
// tela depois.
export const ROLE_IDS = [1, 2, 3] as const;

export class UpdateAdminUserDTO {
  @ApiProperty({ required: false, enum: ROLE_IDS, description: '1 admin, 2 moderador, 3 usuário' })
  @IsOptional()
  @IsIn(ROLE_IDS as unknown as number[])
  roleId?: number;

  @ApiProperty({ required: false, description: 'Zera o bloqueio por tentativas de login' })
  @IsOptional()
  @IsBoolean()
  unlock?: boolean;

  @ApiProperty({ required: false, description: 'Desvincula a conta do Telegram' })
  @IsOptional()
  @IsBoolean()
  unlinkTelegram?: boolean;
}
