import { ApiProperty, PartialType } from '@nestjs/swagger';
import { IsArray, IsBoolean, IsIn, IsOptional, IsString, MinLength } from 'class-validator';

// Os dois papéis em uso: 1 admin, 3 usuário. O 2 (moderator) continua na tabela
// `roles` mas ninguém nunca esteve nele e nenhuma regra do sistema o consulta —
// oferecer na tela era convidar a criar um papel sem significado.
//
// IsIn em vez de IsInt: roleId 7 não é erro de digitação, é usuário com papel
// órfão que ninguém consegue arrumar pela tela depois.
export const ROLE_IDS = [1, 3] as const;

export class UpdateAdminUserDTO {
  @ApiProperty({ required: false, enum: ROLE_IDS, description: '1 admin, 3 usuário' })
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
}

export class UpdateAdminHouseDTO extends PartialType(CreateAdminHouseDTO) {
  @ApiProperty({ required: false, description: 'Casa inativa some das listas de seleção' })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
