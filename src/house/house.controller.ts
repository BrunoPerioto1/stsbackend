import { Controller, Get, Post, Body, Patch, Param, Delete, Query } from '@nestjs/common';
import {
  ApiOperation,
  ApiResponse,
  ApiTags,
  ApiBadRequestResponse,
  ApiNotFoundResponse,
  ApiQuery,
} from '@nestjs/swagger';
import { HouseService } from './house.service';
import { CreateHouseDto } from '../infra/dto/new-house.dto';
import { UpdateHouseDto } from '../infra/dto/update-house.dto';
import { CreateTransacaoDto } from '../infra/dto/new-transation.dto';

@ApiTags('Casas de Aposta')
@Controller('house')
export class HouseController {
  constructor(private readonly houseService: HouseService) {}

  @Post()
  @ApiOperation({ summary: 'Cria uma nova casa de aposta' })
  @ApiResponse({
    status: 201,
    description: 'Casa criada com sucesso.',
    type: CreateHouseDto,
  })
  @ApiBadRequestResponse({
    description: 'Dados de entrada inválidos.',
  })
  createHouse(@Body() createHouseDto: CreateHouseDto) {
    return this.houseService.createHouse(createHouseDto);
  }

  @Get()
  @ApiOperation({ summary: 'Lista todas as casas de aposta' })
  @ApiResponse({
    status: 200,
    description: 'Lista de casas retornada com sucesso.',
    type: [CreateHouseDto],
  })
  findAllHouses() {
    return this.houseService.findAllHouses();
  }

  @Get('balances')
  @ApiOperation({ summary: 'Calcula saldos de todas as casas' })
  @ApiResponse({
    status: 200,
    description: 'Saldos calculados com sucesso.',
  })
  calculateAllHousesBalance() {
    return this.houseService.calculateAllHousesBalance();
  }

  @Get('resolve')
  @ApiOperation({ summary: 'Resolve casa por texto' })
  @ApiQuery({ name: 'texto', description: 'Texto para buscar a casa' })
  @ApiResponse({
    status: 200,
    description: 'Casa encontrada com sucesso.',
  })
  @ApiNotFoundResponse({
    description: 'Casa não encontrada.',
  })
  resolveHouseByText(@Query('texto') texto: string) {
    return this.houseService.resolveHouseByText(texto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Busca uma casa por ID' })
  @ApiResponse({
    status: 200,
    description: 'Casa encontrada com sucesso.',
    type: CreateHouseDto,
  })
  @ApiNotFoundResponse({
    description: 'Casa não encontrada.',
  })
  findHouseById(@Param('id') id: string) {
    return this.houseService.findHouseById(+id);
  }

  @Get(':id/balance')
  @ApiOperation({ summary: 'Calcula saldo de uma casa específica' })
  @ApiResponse({
    status: 200,
    description: 'Saldo calculado com sucesso.',
  })
  @ApiNotFoundResponse({
    description: 'Casa não encontrada.',
  })
  calculateHouseBalance(@Param('id') id: string) {
    return this.houseService.calculateHouseBalance(+id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Atualiza uma casa existente' })
  @ApiResponse({
    status: 200,
    description: 'Casa atualizada com sucesso.',
    type: UpdateHouseDto,
  })
  @ApiBadRequestResponse({
    description: 'Dados de entrada inválidos ou ID da casa não é válido.',
  })
  @ApiNotFoundResponse({
    description: 'Casa não encontrada.',
  })
  updateHouse(@Param('id') id: string, @Body() updateHouseDto: UpdateHouseDto) {
    return this.houseService.updateHouse(+id, updateHouseDto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Remove uma casa' })
  @ApiResponse({
    status: 200,
    description: 'Casa removida com sucesso.',
  })
  @ApiNotFoundResponse({
    description: 'Casa não encontrada.',
  })
  deleteHouse(@Param('id') id: string) {
    return this.houseService.deleteHouse(+id);
  }

  // Transaction routes
  @Post('transaction')
  @ApiOperation({ summary: 'Cria uma nova transação' })
  @ApiResponse({
    status: 201,
    description: 'Transação criada com sucesso.',
    type: CreateTransacaoDto,
  })
  @ApiBadRequestResponse({
    description: 'Dados de entrada inválidos.',
  })
  createTransaction(@Body() createTransactionDto: CreateTransacaoDto) {
    return this.houseService.createTransaction(createTransactionDto);
  }

  @Get('transactions')
  @ApiOperation({ summary: 'Lista todas as transações' })
  @ApiResponse({
    status: 200,
    description: 'Lista de transações retornada com sucesso.',
    type: [CreateTransacaoDto],
  })
  findAllTransactions() {
    return this.houseService.findAllTransactions();
  }

  @Get(':id/transactions')
  @ApiOperation({ summary: 'Lista transações de uma casa específica' })
  @ApiResponse({
    status: 200,
    description: 'Lista de transações retornada com sucesso.',
    type: [CreateTransacaoDto],
  })
  @ApiNotFoundResponse({
    description: 'Casa não encontrada.',
  })
  findTransactionsByHouse(@Param('id') id: string) {
    return this.houseService.findTransactionsByHouse(+id);
  }

  @Get(':id/history')
  @ApiOperation({ summary: 'Busca histórico completo de uma casa' })
  @ApiResponse({
    status: 200,
    description: 'Histórico retornado com sucesso.',
  })
  @ApiNotFoundResponse({
    description: 'Casa não encontrada.',
  })
  findHouseHistory(@Param('id') id: string) {
    return this.houseService.findHouseHistory(+id);
  }
}