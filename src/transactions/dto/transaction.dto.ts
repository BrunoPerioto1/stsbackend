import { IsNumber, IsString, IsPositive, IsNotEmpty, IsOptional } from "class-validator";
import { ApiProperty } from "@nestjs/swagger";

export enum TransactionTypeEnum {
  DEPOSIT = 1,
  WITHDRAWAL = 2,
  ADJUSTMENT = 3,
}


export class NewTransactionDto {
  @ApiProperty({
    description: 'ID da casa de apostas',
    example: 1,
    required: true
  })
  @IsNumber()
  @IsPositive()
  houseId!: number;

  @ApiProperty({
    description: 'ID do tipo de transação (1=Depósito, 2=Saque, 3=Ajuste)',
    example: 1,
    required: true
  })
  @IsNumber()
  @IsPositive()
  transactionTypeId!: number;

  @ApiProperty({
    description: 'Valor da transação',
    example: 100.50,
    required: true
  })
  @IsNumber()
  value!: number;

  @ApiProperty({
    description: 'Descrição da transação',
    example: 'Depósito via Pix',
    required: false
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  description?: string;

  @ApiProperty({
    description: 'ID do usuário que realizou a transação',
    example: 42,
    required: false
  })
  @IsOptional()
  @IsNumber()
  userId?: number;
}

