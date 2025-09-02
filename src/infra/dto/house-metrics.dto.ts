import { IsNumber } from "class-validator";
import { ApiProperty } from "@nestjs/swagger";

export class HouseMetricsDto {
    @ApiProperty({
        description: "Soma de todas as stakes ",
        example: 10000
    })
    @IsNumber()
    totalInvested: number;

    @ApiProperty({
        description: "Saldo atual em tempo real",
        example: 12500
    })
    @IsNumber()
    currentBalance: number;

    @ApiProperty({
        description: "Lucro total (retorno - investido)",
        example: 2500
    })
    @IsNumber()
    totalProfit: number;

    @ApiProperty({
        description: "Quantidade de apostas feitas",
        example: 150
    })
    @IsNumber()
    totalBets: number;

    @ApiProperty({
        description: "Quantidade total de casas de apostas cadastradas no sistema",
        example: 5
    })
    @IsNumber()
    totalHousesUsed: number;
}