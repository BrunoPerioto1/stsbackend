import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MinLength } from 'class-validator';

export class LoginDTO {
	@ApiProperty()
	@IsEmail()
	email!: string;

	@ApiProperty()
	@IsString()
	@MinLength(6)
	password!: string;
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
