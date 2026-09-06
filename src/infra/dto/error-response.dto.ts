import { ApiProperty } from '@nestjs/swagger';

class ErrorResponseDto {
  @ApiProperty({
    description: 'Código de status HTTP',
    example: 400
  })
  statusCode!: number;

  @ApiProperty({
    description: 'Mensagem de erro',
    example: 'Saldo insuficiente para saque'
  })
  message!: string;

  @ApiProperty({
    description: 'Tipo de erro',
    example: 'Bad Request'
  })
  error!: string;
}

export class InsufficientBalanceErrorDto extends ErrorResponseDto {
  @ApiProperty({
    description: 'Saldo atual da casa',
    example: 150.75
  })
  currentBalance!: number;

  @ApiProperty({
    description: 'Valor solicitado para saque',
    example: 200.00
  })
  requestedAmount!: number;
}
