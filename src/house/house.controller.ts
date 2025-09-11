import { Controller, Get, Post, Body, Param, Query } from '@nestjs/common';
import {
  ApiOperation,
  ApiResponse,
  ApiTags,
  ApiBadRequestResponse,
  ApiNotFoundResponse,
  ApiQuery,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { HouseService } from './house.service';
import { InsufficientBalanceErrorDto } from '../infra/dto/error-response.dto';
import { HouseFilterDto } from './dto/house.filter.dto';
import { UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { User } from '../common/decorators/user.decorator';

@ApiTags('Casas de Aposta')
@Controller('house')
export class HouseController {
  constructor(private readonly houseService: HouseService) {}

  @Get('balances')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Calcula saldos de casas com apostas registradas (escopo do usuário)' })
  @ApiQuery({ name: 'houseId', required: false, type: Number, description: 'Filtra por ID da casa de apostas' })
  @ApiQuery({ name: 'houseName', required: false, type: String, description: 'Filtra por nome da casa de apostas (busca parcial)' })
  @ApiResponse({
    status: 200,
    description: 'Saldos calculados com sucesso.',
  })
  calculateAllHousesBalance(@Query() filter: HouseFilterDto, @User('userId') userId: number) {
    return this.houseService.getAllHousesBalanceWithFilter(filter, userId);
  }

  @Get('metrics')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Obtém métricas de casas de aposta (escopo do usuário)' })
  @ApiResponse({ status: 200, description: 'Métricas retornadas com sucesso.' })
  getHouseMetrics(@User('userId') userId: number) {
    return this.houseService.getHouseMetrics(userId);
  }

  @Get('all')
  @ApiOperation({ summary: 'Lista todas as casas de apostas' })
  @ApiResponse({ status: 200, description: 'Lista de casas retornada com sucesso.' })
  getAllHouses() {
    return this.houseService.getAllHouses();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Busca uma casa por ID' })
  @ApiResponse({ status: 200, description: 'Casa encontrada com sucesso.' })
  @ApiNotFoundResponse({ description: 'Casa não encontrada.' })
  findHouseById(@Param('id') id: string) {
    return this.houseService.findHouseById(+id);
  }

  // @Get(':id/balance')
  // @ApiOperation({ summary: 'Calcula saldo de uma casa específica' })
  // @ApiResponse({ status: 200, description: 'Saldo calculado com sucesso.' })
  // @ApiNotFoundResponse({ description: 'Casa não encontrada.' })
  // calculateHouseBalance(@Param('id') id: string) {
  //   return this.houseService.calculateHouseBalance(+id);
  // }

}