import { Controller, Get, Post, Body, Param } from '@nestjs/common';
import {
  ApiOperation,
  ApiResponse,
  ApiTags,
  ApiBadRequestResponse,
  ApiNotFoundResponse,
} from '@nestjs/swagger';
import { HouseService } from './house.service';
import { InsufficientBalanceErrorDto } from '../infra/dto/error-response.dto';

@ApiTags('Casas de Aposta')
@Controller('house')
export class HouseController {
  constructor(private readonly houseService: HouseService) {}

  @Get('balances')
  @ApiOperation({ summary: 'Calcula saldos de casas com apostas registradas' })
  @ApiResponse({
    status: 200,
    description: 'Saldos calculados com sucesso.',
  })
  calculateAllHousesBalance() {
    return this.houseService.calculateAllHousesBalance();
  }

  @Get('metrics')
  @ApiOperation({ summary: 'Obtém métricas de todas as casas de aposta' })
  @ApiResponse({ status: 200, description: 'Métricas retornadas com sucesso.' })
  getHouseMetrics() {
    return this.houseService.getHouseMetrics();
  }




  @Get(':id')
  @ApiOperation({ summary: 'Busca uma casa por ID' })
  @ApiResponse({ status: 200, description: 'Casa encontrada com sucesso.' })
  @ApiNotFoundResponse({ description: 'Casa não encontrada.' })
  findHouseById(@Param('id') id: string) {
    return this.houseService.findHouseById(+id);
  }

  @Get(':id/balance')
  @ApiOperation({ summary: 'Calcula saldo de uma casa específica' })
  @ApiResponse({ status: 200, description: 'Saldo calculado com sucesso.' })
  @ApiNotFoundResponse({ description: 'Casa não encontrada.' })
  calculateHouseBalance(@Param('id') id: string) {
    return this.houseService.calculateHouseBalance(+id);
  }


  @Get(':id/history')
  @ApiOperation({ summary: 'Busca histórico completo de uma casa' })
  @ApiResponse({ status: 200, description: 'Histórico retornado com sucesso.' })
  @ApiNotFoundResponse({ description: 'Casa não encontrada.' })
  findHouseHistory(@Param('id') id: string) {
    return this.houseService.findHouseHistory(+id);
  }
}