import { IsString, IsNotEmpty, IsOptional, IsBoolean } from 'class-validator';

export class CreateHouseDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}