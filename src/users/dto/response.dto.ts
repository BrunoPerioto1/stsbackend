import { ApiProperty } from '@nestjs/swagger';

export class CreateUserResponseDTO {
  @ApiProperty()
  id!: number;

  @ApiProperty()
  username!: string;

  @ApiProperty()
  email!: string;

  @ApiProperty({ required: false })
  fullName?: string | null;

  @ApiProperty()
  isActive!: boolean | null;

  @ApiProperty()
  roleId!: number;

  @ApiProperty()
  createdAt!: Date | null;

  @ApiProperty()
  updatedAt!: Date | null;

  @ApiProperty({ required: false })
  lastLogin?: Date | null;
}


