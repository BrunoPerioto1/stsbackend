import { IsNumber, IsString } from "class-validator";
import { ApiProperty } from "@nestjs/swagger";

export class HouseBalanceDto {
  @ApiProperty({
    description: "ID da casa de apostas",
    example: 1
  })
  @IsNumber()
  houseId: number;

  @ApiProperty({
    description: "Nome da casa de apostas",
    example: "1XBET"
  })
  @IsString()
  houseName: string;

  @ApiProperty({
    description: "Total de apostas feitas",
    example: 150
  })
  @IsNumber()
  totalBets: number;

  @ApiProperty({
    description: "Total investido em stakes",
    example: 10000.00
  })
  @IsNumber()
  totalStake: number;

  @ApiProperty({
    description: "Lucro total das apostas",
    example: 2500.00
  })
  @IsNumber()
  totalBetProfit: number;

  @ApiProperty({
    description: "Total de transações (depósitos - saques + ajustes)",
    example: 500.00
  })
  @IsNumber()
  totalTransactions: number;

  @ApiProperty({
    description: "Saldo da casa (nunca negativo)",
    example: 13000.00
  })
  @IsNumber()
  houseBalance: number;

  @ApiProperty({
    description: "Saldo real da casa (pode ser negativo)",
    example: 13000.00
  })
  @IsNumber()
  realHouseBalance: number;

  @ApiProperty({
    description: "Quantidade de apostas pendentes",
    example: 25
  })
  @IsNumber()
  pendingBets: number;

  @ApiProperty({
    description: "Quantidade de apostas ganhas",
    example: 80
  })
  @IsNumber()
  wonBets: number;

  @ApiProperty({
    description: "Quantidade de apostas perdidas",
    example: 45
  })
  @IsNumber()
  lostBets: number;
}
