import { IsNumber, IsString, IsOptional, IsBoolean } from "class-validator";
import { ApiProperty, OmitType, PickType } from "@nestjs/swagger";
import { PartialType } from '@nestjs/mapped-types';

export class HouseDto {
  @ApiProperty({ description: "ID da casa de apostas", example: 1 })
  @IsNumber()
  houseId: number;

  @ApiProperty({ description: "Nome da casa de apostas", example: "Bet365" })
  @IsString()
  houseName: string;

  @ApiProperty({ description: "Status ativo da casa de apostas", example: true, required: false, default: true })
  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @ApiProperty({ description: "Total de apostas feitas", example: 150 })
  @IsNumber()
  totalBets: number;

  @ApiProperty({ description: "Total investido em stakes", example: 10000.00 })
  @IsNumber()
  totalStake: number;

  @ApiProperty({ description: "Lucro total das apostas", example: 2500.00 })
  @IsNumber()
  totalBetProfit: number;

  @ApiProperty({ description: "Total de depósitos", example: 500.00 })
  @IsNumber()
  totalDeposit: number;

  @ApiProperty({ description: "Total de saques", example: 200.00 })
  @IsNumber()
  totalWithdrawal: number;

  @ApiProperty({ description: "Total de transações (depósitos + saques + ajustes)", example: 700.00 })
  @IsNumber()
  totalTransactions: number;

  @ApiProperty({ description: "Saldo da casa (nunca negativo)", example: 13000.00 })
  @IsNumber()
  houseBalance: number;

  @ApiProperty({ description: "Saldo real da casa (pode ser negativo)", example: 13000.00 })
  @IsNumber()
  realHouseBalance: number;

  @ApiProperty({ description: "Quantidade de apostas pendentes", example: 25 })
  @IsNumber()
  pendingBets: number;

  @ApiProperty({ description: "Quantidade de apostas ganhas", example: 80 })
  @IsNumber()
  wonBets: number;

  @ApiProperty({ description: "Quantidade de apostas perdidas", example: 45 })
  @IsNumber()
  lostBets: number;

  @ApiProperty({ description: "Soma de todas as stakes", example: 10000 })
  @IsNumber()
  totalInvested: number;

  @ApiProperty({ description: "Saldo atual em tempo real", example: 12500 })
  @IsNumber()
  currentBalance: number;

  @ApiProperty({ description: "Lucro total (retorno - investido)", example: 2500 })
  @IsNumber()
  totalProfit: number;

  @ApiProperty({ description: "Quantidade total de casas de apostas cadastradas no sistema", example: 5 })
  @IsNumber()
  totalHousesUsed: number;
}

export class CreateHouseDto {
  @ApiProperty({ description: "Nome da casa de apostas", example: "Bet365", required: true })
  @IsString()
  houseName: string;

  @ApiProperty({ description: "Status ativo da casa de apostas", example: true, required: false, default: true })
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class UpdateHouseDto extends PartialType(CreateHouseDto) {}

export class FindByIdDto extends PickType(HouseDto, ['houseId', 'houseName', 'active']) {}

export class FindAllHousesDTO  {

  @ApiProperty({ description: "ID da casa de apostas", example: 1 })
  @IsNumber()
  id: number;

  @ApiProperty({ description: "Nome da casa de apostas", example: "Bet365" })
  @IsString()
  name: string;

  @ApiProperty({ description: "Status ativo da casa de apostas", example: true, required: false, default: true })
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

