import { ApiProperty } from '@nestjs/swagger';

export class UserDto {
  @ApiProperty()
  id: number;

  @ApiProperty()
  username: string;

  @ApiProperty()
  email: string;

  @ApiProperty()
  password_hash: string;

  @ApiProperty({ nullable: true })
  full_name: string | null;

  @ApiProperty({ nullable: true })
  is_active: boolean | null;

  @ApiProperty()
  role_id: number;

  @ApiProperty({ type: String, nullable: true })
  created_at: Date | null;

  @ApiProperty({ type: String, nullable: true })
  updated_at: Date | null;

  @ApiProperty({ type: String, nullable: true })
  last_login: Date | null;
}
