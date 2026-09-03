import { IsNumber, IsString, IsPositive, IsNotEmpty, IsOptional } from "class-validator";
import { ApiProperty } from "@nestjs/swagger";

export enum TransactionTypeEnum {
  DEPOSIT = 1,
  WITHDRAWAL = 2,
  ADJUSTMENT = 3,
}

export class TransactionTypeDto {
  @ApiProperty({ description: "ID do tipo de transação", example: 1 })
  @IsNumber()
  id!: number;

  @ApiProperty({ description: "Nome do tipo de transação", example: "DEPOSIT" })
  @IsString()
  name!: string;
}

export class GetTransactionDto {
  @ApiProperty({ description: "ID da transação", example: 123 })
  @IsNumber()
  id!: number;

  @ApiProperty({ description: "Nome da casa de apostas", example: "Bet365" })
  @IsString()
  houseName!: string;

  @ApiProperty({ description: "Tipo de transação", example: "DEPOSIT" })
  @IsString()
  transactionType!: string;

  @ApiProperty({ description: "Valor da transação", example: 500.00 })
  @IsNumber()
  value!: number;

  @ApiProperty({ description: "Data de criação da transação", example: "2025-09-03T12:34:56.000Z" })
  @IsString()
  createdAt!: string;
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

