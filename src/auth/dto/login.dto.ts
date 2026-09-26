import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsEmail, IsOptional, IsString, Matches, MinLength } from 'class-validator';

export class LoginDTO {
	@ApiProperty()
	@IsEmail()
	email!: string;

	@ApiProperty()
	@IsString()
	@MinLength(6)
	password!: string;

	// "Manter conectado": token de 30 dias em vez de 1. Antes a caixa só
	// lembrava o e-mail, e a sessão caía no dia seguinte do mesmo jeito.
	@ApiProperty({ required: false, description: 'Sessão de 30 dias em vez de 1' })
	@IsOptional()
	@IsBoolean()
	remember?: boolean;
}

export class ChangePasswordDTO {
	@ApiProperty()
	@IsString()
	currentPassword!: string;

	@ApiProperty({ description: 'Nova senha, mínimo de 6 caracteres' })
	@IsString()
	@MinLength(6)
	newPassword!: string;
}

export class ForgotPasswordDTO {
	@ApiProperty()
	@IsEmail()
	email!: string;
}

export class ResetPasswordDTO {
	@ApiProperty()
	@IsEmail()
	email!: string;

	@ApiProperty({ description: 'Código de 6 dígitos mandado pelo bot' })
	@IsString()
	@Matches(/^\s*\d{6}\s*$/, { message: 'O código tem 6 dígitos.' })
	code!: string;

	@ApiProperty({ description: 'Nova senha, mínimo de 6 caracteres' })
	@IsString()
	@MinLength(6)
	newPassword!: string;
}
