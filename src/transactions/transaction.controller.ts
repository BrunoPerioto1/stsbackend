import { Controller, Get, Post, Body, Param, Query } from '@nestjs/common';
import {
  ApiOperation,
  ApiResponse,
  ApiTags,
  ApiBadRequestResponse,
  ApiNotFoundResponse,
  ApiQuery,
} from '@nestjs/swagger';
import { HttpStatus } from '@nestjs/common';
import { InsufficientBalanceErrorDto } from '../infra/dto/error-response.dto';
import { NewTransactionDto } from './dto/transaction.dto';
import { TransactionFilterDto } from './dto/transaction.filter.dto';
import { TransactionService } from './transaction.service';

@ApiTags('Transações')
@Controller('transactions')
export class TransactionController {
  constructor(private readonly transactionService: TransactionService) {}

  

  @Post('transaction')
  @ApiOperation({ summary: 'Cria uma nova transação' })
  @ApiResponse({ status: 201, description: 'Transação criada com sucesso.', type: NewTransactionDto })
  @ApiBadRequestResponse({ description: 'Dados de entrada inválidos.' })
  @ApiResponse({ status: 400, description: 'Saldo insuficiente para saque.', type: InsufficientBalanceErrorDto })
  createTransaction(@Body() createTransactionDto: NewTransactionDto) {
    return this.transactionService.createTransaction(createTransactionDto);
  }

  @Get()
  @ApiOperation({ summary: 'Lista todas as transações com filtros opcionais' })
  @ApiQuery({ name: 'houseId', required: false, type: String, description: 'Filtra por ID da casa .' })
  @ApiQuery({ name: 'startDate', required: false, type: String, description: 'Filtra por data inicial (ex: 2025-09-03).' })
  @ApiQuery({ name: 'endDate', required: false, type: String, description: 'Filtra por data final (ex: 2025-09-04).' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Lista de transações retornada com sucesso.' })
  findAllTransactions(@Query() filter: TransactionFilterDto) {
    return this.transactionService.findAllTransactions(filter);
  }



//   @Get(':id/transactions')
//   @ApiOperation({ summary: 'Lista transações de uma casa específica' })
//   @ApiResponse({ status: 200, description: 'Lista de transações retornada com sucesso.', type: [CreateTransacaoDto] })
//   @ApiNotFoundResponse({ description: 'Casa não encontrada.' })
//   findTransactionsByHouse(@Param('id') id: string) {
//     return this.houseService.findTransactionsByHouse(+id);
//   }


}