import { ApiProperty } from '@nestjs/swagger';

export class CreateUserResponseDTO {
  @ApiProperty()
  id: number;

  @ApiProperty()
  username: string;

  @ApiProperty()
  email: string;

  @ApiProperty({ required: false })
  full_name?: string | null;

  @ApiProperty()
  is_active: boolean | null;

  @ApiProperty()
  role_id: number;

  @ApiProperty()
  created_at: Date | null;

  @ApiProperty()
  updated_at: Date | null;

  @ApiProperty({ required: false })
  last_login?: Date | null;
}


