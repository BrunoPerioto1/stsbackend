import {
  Controller,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Get,
  ParseIntPipe,
  HttpCode,
  HttpStatus,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { User } from '../common/decorators/user.decorator';
import {
  ApiOperation,
  ApiResponse,
  ApiTags,
  ApiQuery,
  ApiBadRequestResponse,
  ApiNotFoundResponse,
  ApiNoContentResponse,
} from '@nestjs/swagger';
import { ApostaService } from './bet.service';
import { CreateBetDto } from './dto/bet.dto';
import { UpdateApostaDto } from '../bet/dto/bet.dto';
import {
  FinalizarApostaDto,
  FinalizarMultiplasDto,
  BetItem
} from './dto/bet.dto';
import { BetFilterDto } from './dto/bet-filter.dto';

@ApiTags('Apostas')
@Controller('bets')
export class ApostaController {
  constructor(private readonly apostaService: ApostaService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Cria uma nova aposta' })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'Aposta criada com sucesso.',
    type: CreateBetDto,
  })
  @ApiBadRequestResponse({
    description: 'Dados de entrada inválidos.',
  })
  async criar(@Body() apostaData: CreateBetDto) {
    return this.apostaService.createBet(apostaData);
  }

  @Get()
  @ApiOperation({ summary: 'Lista e filtra as apostas' })
  @ApiQuery({ name: 'betId', required: false, type: Number, description: 'Filtra por ID da aposta.' })
  @ApiQuery({ name: 'startDate', required: false, type: String, description: 'Filtra por data inicial (ex: 2025-09-03).' })
  @ApiQuery({ name: 'endDate', required: false, type: String, description: 'Filtra por data final (ex: 2025-09-04).' })
  @ApiQuery({ name: 'resultId', required: false, type: Number, description: 'Filtra por ID do resultado.' })
  @ApiQuery({ name: 'market', required: false, type: String, description: 'Filtra por nome do mercado (busca parcial).' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Lista de apostas retornada com sucesso.',
    type: [BetItem],
  })
  async findBets(@Query() filters: BetFilterDto) {
    return this.apostaService.findBets(filters);
  }

  @Put('finalize-multiple')
  @ApiOperation({ summary: 'Finaliza múltiplas apostas (apenas admin)' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Aposta finalizada com sucesso.',
  })
  @ApiBadRequestResponse({
    description: 'Dados de entrada inválidos ou ID da aposta não é válido.',
  })
  @ApiNotFoundResponse({
    description: 'Aposta não encontrada.',
  })
  
  async finalizarMultiplas(@Body() body: FinalizarMultiplasDto) {
    const { betIds, resultId } = body;
    return this.apostaService.finalizeMany(betIds, resultId);
  }

  @Put('finalize/:id')
  @ApiOperation({ summary: 'Finaliza uma aposta individual (apenas admin)' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Aposta finalizada com sucesso.',
  })
  @ApiBadRequestResponse({
    description: 'Dados de entrada inválidos ou ID da aposta não é válido.',
  })
  @ApiNotFoundResponse({
    description: 'Aposta não encontrada.',
  })
  
  async finalizar(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: FinalizarApostaDto,
  ) {
    return this.apostaService.finalizeBet(id, body.resultId);
  }

  @Delete('delete-multiple')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove múltiplas apostas (apenas admin)' })
  @ApiNoContentResponse({
    description: 'Apostas removidas com sucesso.',
  })
  @ApiBadRequestResponse({
    description: 'Dados de entrada inválidos.',
  })
  async deletarMultiplas(@Body() body: { apostaIds: number[] }) {
    return this.apostaService.deleteManyBets(body.apostaIds);
  }

  // @Get(':id')
  // @ApiOperation({ summary: 'Busca uma aposta por ID' })
  // @ApiResponse({
  //   status: HttpStatus.OK,
  //   description: 'Aposta encontrada com sucesso.',
  //   type: CreateBetDto,
  // })
  // @ApiNotFoundResponse({
  //   description: 'Aposta não encontrada.',
  // })
  // async buscar(@Param('id', ParseIntPipe) id: number) {
  //   return this.apostaService.findBetById(id);
  // }

  @Put(':id')
  @ApiOperation({ summary: 'Atualiza uma aposta existente' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Aposta atualizada com sucesso.',
    type: UpdateApostaDto,
  })
  @ApiBadRequestResponse({
    description: 'Dados de entrada inválidos ou ID da aposta não é válido.',
  })
  @ApiNotFoundResponse({
    description: 'Aposta não encontrada.',
  })
  async editar(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateData: UpdateApostaDto,
  ) {
    console.log('Controller - Dados recebidos para edição:', updateData);
    console.log('Controller - ID da aposta:', id);
    return this.apostaService.updateBet(id, updateData);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove uma aposta do usuário' })
  @ApiNoContentResponse({
    description: 'Aposta removida com sucesso.',
  })
  @ApiNotFoundResponse({
    description: 'Aposta não encontrada.',
  })
  async deletar(@Param('id', ParseIntPipe) id: number) {
    return this.apostaService.deleteBet(id);
  }

  @Get('result-types')
  @ApiOperation({ summary: 'Lista todos os tipos de resultados' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Lista de tipos de resultados retornada com sucesso.',
    type: [Object],
  })
  async getResultTypes() {
    return this.apostaService.getResultTypes();
  }


}
