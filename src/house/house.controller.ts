import { Controller, Get, Post, Body, Param, Query } from '@nestjs/common';
import {
  ApiOperation,
  ApiResponse,
  ApiTags,
  ApiBadRequestResponse,
  ApiNotFoundResponse,
  ApiQuery,
} from '@nestjs/swagger';
import { HouseService } from './house.service';
import { InsufficientBalanceErrorDto } from '../infra/dto/error-response.dto';
import { HouseFilterDto } from './dto/house.filter.dto';

@ApiTags('Casas de Aposta')
@Controller('house')
export class HouseController {
  constructor(private readonly houseService: HouseService) {}

  @Get('balances')
  @ApiOperation({ summary: 'Calcula saldos de casas com apostas registradas' })
  @ApiQuery({ name: 'houseId', required: false, type: Number, description: 'Filtra por ID da casa de apostas' })
  @ApiQuery({ name: 'houseName', required: false, type: String, description: 'Filtra por nome da casa de apostas (busca parcial)' })
  @ApiResponse({
    status: 200,
    description: 'Saldos calculados com sucesso.',
  })
  calculateAllHousesBalance(@Query() filter: HouseFilterDto) {
    return this.houseService.getAllHousesBalanceWithFilter(filter);
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
 @Get()
  @ApiOperation({ summary: 'Lista todas as casas de apostas' })
  @ApiResponse({ status: 200, description: 'Lista de casas retornada com sucesso.' })
  getAllHouses() {
    return this.houseService.getAllHouses();
  }
 
}