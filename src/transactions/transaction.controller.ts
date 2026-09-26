import { Controller, Get, Post, Patch, Delete, Body, Query, Param, ParseIntPipe, HttpCode, UseGuards } from '@nestjs/common';
import {
  ApiOperation,
  ApiResponse,
  ApiTags,
  ApiBadRequestResponse,
  ApiQuery,
  ApiBearerAuth,
  ApiNotFoundResponse,
} from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { User } from '../common/decorators/user.decorator';
import { HttpStatus } from '@nestjs/common';
import { InsufficientBalanceErrorDto } from '../infra/dto/error-response.dto';
import { NewTransactionDto, UpdateTransactionDto } from './dto/transaction.dto';
import { TransactionFilterDto } from './dto/transaction.filter.dto';
import { TransactionService } from './transaction.service';

@ApiTags('Transações')
@Controller('transactions')
export class TransactionController {
  constructor(private readonly transactionService: TransactionService) {}

  

  @Post('new')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Cria uma nova transação' })
  @ApiResponse({ status: 201, description: 'Transação criada com sucesso.', type: NewTransactionDto })
  @ApiBadRequestResponse({ description: 'Dados de entrada inválidos.' })
  @ApiResponse({ status: 400, description: 'Saldo insuficiente para saque.', type: InsufficientBalanceErrorDto })
  createTransaction(@Body() createTransactionDto: NewTransactionDto, @User('userId') userId: number) {
    return this.transactionService.createTransaction({ ...createTransactionDto, userId });
  }

  @Get('all')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Lista todas as transações com filtros opcionais' })
  @ApiQuery({ name: 'houseId', required: false, type: String, description: 'Filtra por ID da casa .' })
  @ApiQuery({ name: 'startDate', required: false, type: String, description: 'Filtra por data inicial (ex: 2025-09-03).' })
  @ApiQuery({ name: 'endDate', required: false, type: String, description: 'Filtra por data final (ex: 2025-09-04).' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Lista de transações retornada com sucesso.' })
  findAllTransactions(@Query() filter: TransactionFilterDto, @User('userId') userId: number) {
    return this.transactionService.findAllTransactions(userId, filter);
  }
  @Patch(':id')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Corrige uma movimentação (tipo, valor ou descrição)' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Movimentação atualizada.' })
  @ApiNotFoundResponse({ description: 'Movimentação não encontrada para o usuário.' })
  updateTransaction(
    @Param('id', ParseIntPipe) id: number,
    @Body() changes: UpdateTransactionDto,
    @User('userId') userId: number,
  ) {
    return this.transactionService.updateTransaction(id, userId, changes);
  }

  @Delete(':id')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Exclui uma movimentação lançada errada' })
  @ApiNotFoundResponse({ description: 'Movimentação não encontrada para o usuário.' })
  deleteTransaction(@Param('id', ParseIntPipe) id: number, @User('userId') userId: number) {
    return this.transactionService.deleteTransaction(id, userId);
  }

  @Get('types')
  @ApiOperation({ summary: 'Lista todos os tipos de transações' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Lista de tipos de transações retornada com sucesso.' })
  findAllTypeTransactions() {
    return this.transactionService.findAllTypeTransactions();
  }


//   @Get(':id/transactions')
//   @ApiOperation({ summary: 'Lista transações de uma casa específica' })
//   @ApiResponse({ status: 200, description: 'Lista de transações retornada com sucesso.', type: [CreateTransacaoDto] })
//   @ApiNotFoundResponse({ description: 'Casa não encontrada.' })
//   findTransactionsByHouse(@Param('id') id: string) {
//     return this.houseService.findTransactionsByHouse(+id);
//   }


}