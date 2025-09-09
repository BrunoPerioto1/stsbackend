import { ApiProperty, PartialType } from '@nestjs/swagger';
import { IsEmail, IsInt, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateUserRequestDTO {
  @ApiProperty()
  @IsString()
  username: string;

  @ApiProperty()
  @IsEmail()
  email: string;

  @ApiProperty()
  @IsString()
  @MinLength(6)
  password: string;

  @ApiProperty()
  @IsInt()
  roleId: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  full_name?: string;
}

export class UpdateUserRequestDTO extends PartialType(CreateUserRequestDTO) {}


