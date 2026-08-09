import { ApiProperty } from '@nestjs/swagger';

export class UserDto {
  @ApiProperty()
  id: number;

  @ApiProperty()
  username: string;

  @ApiProperty()
  email: string;

  @ApiProperty()
  passwordHash: string;

  @ApiProperty({ nullable: true })
  fullName: string | null;

  @ApiProperty({ nullable: true })
  isActive: boolean | null;

  @ApiProperty()
  roleId: number;

  @ApiProperty({ type: String, nullable: true })
  createdAt: Date | null;

  @ApiProperty({ type: String, nullable: true })
  updatedAt: Date | null;

  @ApiProperty({ type: String, nullable: true })
  lastLogin: Date | null;
}
