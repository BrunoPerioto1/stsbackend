import { Type } from 'class-transformer';
import { DashboardPreferencesDTO } from './dashboard-preferences.dto';
import { ApiProperty, OmitType, PartialType } from '@nestjs/swagger';
import {
  IsObject,
  ValidateNested,
  IsEmail,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreateUserRequestDTO {
  // VARCHAR(50) no banco: acima disso o insert estourava com 500.
  @ApiProperty({ maxLength: 50 })
  @IsString()
  @MaxLength(50)
  username!: string;

  @ApiProperty()
  @IsEmail()
  email!: string;

  @ApiProperty()
  @IsString()
  @MinLength(6)
  password!: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  fullName?: string;
}

// Sem `password`: senha só troca pelo POST /auth/change-password, que pede a
// atual. Aqui bastava o token — quem pegasse a sessão tomava a conta.
export class UpdateUserRequestDTO extends PartialType(OmitType(CreateUserRequestDTO, ['password'] as const)) {
  // Obrigatória só quando o e-mail muda: e-mail é o login, trocar ele é trocar
  // quem entra na conta.
  @ApiProperty({ required: false, description: 'Senha atual (exigida ao trocar o e-mail)' })
  @IsOptional()
  @IsString()
  currentPassword?: string;

  @ApiProperty({
    required: false,
    nullable: true,
    type: DashboardPreferencesDTO,
  })
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => DashboardPreferencesDTO)
  dashboardPreferences?: DashboardPreferencesDTO | null;

  // Stake padrão sugerido ao registrar uma aposta (também usado pelo bot pra
  // calcular a recomendação de valor de uma tip a partir da % dela).
  @ApiProperty({ required: false, description: 'Stake padrão do usuário' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  stake?: number;

  // % mínima (da banca) que o sinal de uma tip precisa indicar pro bot notificar
  // o usuário — mesmo campo usado pelo comando /filtro do bot do Telegram.
  @ApiProperty({
    required: false,
    description:
      'Filtro de % mínima da banca para notificação de sinal (0.01–5.00)',
  })
  @IsOptional()
  @IsNumber()
  @Min(0.01)
  @Max(5)
  minPercentFilter?: number;

  // Dias sem apostar numa casa com saldo até a lista de casas sugerir saque.
  @ApiProperty({
    required: false,
    description: 'Dias sem apostar numa casa até sugerir saque (1–365)',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(365)
  staleHouseDays?: number;
}
