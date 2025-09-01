import { IsNumber, IsString, IsNotEmpty, IsPositive } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateTransacaoDto {
  @ApiProperty({
    description: 'ID da casa de apostas',
    example: 1,
    required: true
  })
  @IsNumber()
  @IsPositive()
  house_id: number;

  @ApiProperty({
    description: 'ID do tipo de transação (1=Depósito, 2=Saque, 3=Ajuste)',
    example: 1,
    required: true
  })
  @IsNumber()
  @IsPositive()
  transaction_type_id: number;

  @ApiProperty({
    description: 'Valor da transação',
    example: 100.50,
    required: true
  })
  @IsNumber()
  valor: number;

  @ApiProperty({
    description: 'Descrição da transação',
    example: 'Depósito inicial',
    required: true
  })
  @IsString()
  @IsNotEmpty()
  descricao: string;
}
