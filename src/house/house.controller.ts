import { Controller, Get, Post, Body, Param, Query, Header } from '@nestjs/common';
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
import { HouseFilterRequestDto } from './dto/house.filter.dto';
import { CreateHouseDto } from './dto/house.dto';
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
  calculateAllHousesBalance(@Query() filter: HouseFilterRequestDto, @User('userId') userId: number) {
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
  // Unica rota do controller sem guard, e o dado e global (a mesma lista pra
  // todo mundo) — entao pode ir pro cache compartilhado da CDN sem risco de
  // vazar dado de um usuario pro outro. As demais rotas sao por usuario e NAO
  // podem receber cache publico.
  @Header('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400')
  @ApiOperation({ summary: 'Lista todas as casas de apostas' })
  @ApiResponse({ status: 200, description: 'Lista de casas retornada com sucesso.' })
  getAllHouses() {
    return this.houseService.getAllHouses();
  }

  @Post()
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Cadastra uma nova casa de apostas' })
  @ApiResponse({ status: 201, description: 'Casa criada com sucesso.' })
  createHouse(@Body() dto: CreateHouseDto) {
    return this.houseService.createHouse(dto);
  }

  @Get('ranking')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Ranking de casas por ROI/Lucro/Taxa de acerto (escopo do usuário)' })
  @ApiQuery({ name: 'startDate', required: false, type: String })
  @ApiQuery({ name: 'endDate', required: false, type: String })
  @ApiQuery({ name: 'minBets', required: false, type: Number })
  @ApiResponse({ status: 200, description: 'Ranking retornado com sucesso.' })
  getHouseRanking(
    @Query('startDate') startDate: string | undefined,
    @Query('endDate') endDate: string | undefined,
    @Query('minBets') minBets: string | undefined,
    @User('userId') userId: number,
  ) {
    return this.houseService.getHouseRanking(userId, startDate, endDate, minBets ? Number(minBets) : undefined);
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