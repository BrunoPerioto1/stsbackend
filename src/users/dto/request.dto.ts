import { ApiProperty, PartialType } from '@nestjs/swagger';
import { IsEmail, IsInt, IsNumber, IsOptional, IsString, Max, Min, MinLength } from 'class-validator';

export class CreateUserRequestDTO {
  @ApiProperty()
  @IsString()
  username!: string;

  @ApiProperty()
  @IsEmail()
  email!: string;

  @ApiProperty()
  @IsString()
  @MinLength(6)
  password!: string;

  @ApiProperty()
  @IsInt()
  roleId!: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  fullName?: string;
}

export class UpdateUserRequestDTO extends PartialType(CreateUserRequestDTO) {
  // Stake padrão sugerido ao registrar uma aposta (também usado pelo bot pra
  // calcular a recomendação de valor de uma tip a partir da % dela).
  @ApiProperty({ required: false, description: 'Stake padrão do usuário' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  stake?: number;

  // % mínima (da banca) que o sinal de uma tip precisa indicar pro bot notificar
  // o usuário — mesmo campo usado pelo comando /filtro do bot do Telegram.
  @ApiProperty({ required: false, description: 'Filtro de % mínima da banca para notificação de sinal (0.01–5.00)' })
  @IsOptional()
  @IsNumber()
  @Min(0.01)
  @Max(5)
  minPercentFilter?: number;
}


