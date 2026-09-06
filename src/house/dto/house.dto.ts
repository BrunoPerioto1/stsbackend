import { IsNumber, IsString, IsOptional, IsBoolean, IsArray } from "class-validator";
import { ApiProperty } from "@nestjs/swagger";

export class CreateHouseDto {
  @ApiProperty({ description: "Nome da casa de apostas", example: "Bet365", required: true })
  @IsString()
  houseName!: string;

  @ApiProperty({ description: "Status ativo da casa de apostas", example: true, required: false, default: true })
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class FindAllHousesDTO  {

  @ApiProperty({ description: "ID da casa de apostas", example: 1 })
  @IsNumber()
  id!: number;

  @ApiProperty({ description: "Nome da casa de apostas", example: "Bet365" })
  @IsString()
  name!: string;

  @ApiProperty({ description: "Status ativo da casa de apostas", example: true, required: false, default: true })
  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @ApiProperty({ description: "Apelidos/variações de nome reconhecidos pelo parser de apostas", example: ["Superbet Brasil"], required: false })
  @IsOptional()
  @IsArray()
  aliases?: string[];
}

