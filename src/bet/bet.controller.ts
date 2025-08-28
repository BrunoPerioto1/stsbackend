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
} from '@nestjs/common';
import {
  ApiOperation,
  ApiResponse,
  ApiTags,
  ApiBadRequestResponse,
  ApiNotFoundResponse,
  ApiNoContentResponse,
} from '@nestjs/swagger';
import { ApostaService } from './bet.service';
import { CreateBetDto } from '../infra/dto/new-bet.dto';
import { UpdateApostaDto } from '../infra/dto/update-bet.dto';
import {
  FinalizarApostaDto,
  FinalizarMultiplasDto,
} from '../infra/dto/end-bet.dto';

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

  @Put('finalize/:id')
  @ApiOperation({ summary: 'Finaliza uma aposta individual' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Aposta finalizada com sucesso.',
    type: FinalizarApostaDto,
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

  @Put('finalize-multiple')
  @ApiOperation({ summary: 'Finaliza múltiplas apostas' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Apostas finalizadas com sucesso.',
    type: FinalizarMultiplasDto,
  })
  @ApiBadRequestResponse({
    description: 'Dados de entrada inválidos.',
  })
  async finalizarMultiplas(@Body() body: FinalizarMultiplasDto) {
    console.log('Controller - Dados recebidos para finalizar múltiplas:', body);
    const { apostaIds, resultId } = body;
    console.log('Controller - apostaIds:', apostaIds);
    console.log('Controller - resultId:', resultId);
    return this.apostaService.finalizeMany(apostaIds, resultId);
  }

  @Get()
  @ApiOperation({ summary: 'Lista todas as apostas' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Lista de apostas retornada com sucesso.',
    type: [CreateBetDto],
  })
  async listarTodas() {
    return this.apostaService.findAllBets();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Busca uma aposta por ID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Aposta encontrada com sucesso.',
    type: CreateBetDto,
  })
  @ApiNotFoundResponse({
    description: 'Aposta não encontrada.',
  })
  async buscar(@Param('id', ParseIntPipe) id: number) {
    return this.apostaService.findBetById(id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove uma aposta' })
  @ApiNoContentResponse({
    description: 'Aposta removida com sucesso.',
  })
  @ApiNotFoundResponse({
    description: 'Aposta não encontrada.',
  })
  async deletar(@Param('id', ParseIntPipe) id: number) {
    return this.apostaService.deleteBet(id);
  }

  @Delete('delete-multiple')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove múltiplas apostas' })
  @ApiNoContentResponse({
    description: 'Apostas removidas com sucesso.',
  })
  @ApiBadRequestResponse({
    description: 'Dados de entrada inválidos.',
  })
  async deletarMultiplas(@Body() body: { apostaIds: number[] }) {
    return this.apostaService.deleteManyBets(body.apostaIds);
  }

  @Get('houses/list')
  @ApiOperation({ summary: 'Lista casas únicas para filtro' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Lista de casas retornada com sucesso.',
    type: [String],
  })
  async listarCasas() {
    return this.apostaService.findUniqueHouses();
  }
}
