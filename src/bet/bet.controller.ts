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
  Header,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { User } from '../common/decorators/user.decorator';
import {
  ApiOperation,
  ApiResponse,
  ApiTags,
  ApiBearerAuth,
  ApiBadRequestResponse,
  ApiNotFoundResponse,
  ApiNoContentResponse,
} from '@nestjs/swagger';
import { BetService } from './bet.service';
import { CreateBetDto, DeleteMultipleBetsDto } from './dto/bet.dto';
import { UpdateApostaDto } from '../bet/dto/bet.dto';
import {
  FinalizarApostaDto,
  FinalizarMultiplasDto,
  PaginatedBetsResponseDto,
} from './dto/bet.dto';
import { BetFilterDto } from './dto/bet-filter.dto';

@ApiTags('Apostas')
@Controller('bets')
export class BetController {
  constructor(private readonly betService: BetService) {}

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
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  async criar(
    @Body() apostaData: CreateBetDto,
    @User('userId') userId: number,
  ) {
    // tipId não faz parte da aposta em si — é o vínculo com a pendência, que o
    // createBet já sabe gravar (mesmo caminho do "PLANILHADO" do bot).
    // fromImage só rotula a origem (print lido x digitada): source e
    // sourceType vindos do payload seguem ignorados, quem decide é o servidor.
    const { tipId, fromImage, ...bet } = apostaData;
    return this.betService.createBet({ ...bet, userId }, tipId, {
      source: 'app',
      sourceType: fromImage ? 'image' : 'manual',
    });
  }

  @Get()
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Lista e filtra as apostas (escopo do usuário)' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Lista de apostas retornada com sucesso.',
    type: PaginatedBetsResponseDto,
  })
  async findBets(
    @Query() filters: BetFilterDto,
    @User('userId') userId: number,
  ) {
    return this.betService.findBets({ ...filters, userId });
  }

  @Get('monthly-summary')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Quantidade e lucro por mês, com os mesmos filtros da lista',
    description: 'A tela agrupada mostra os meses daqui e só busca as linhas do mês aberto.',
  })
  async monthlySummary(
    @Query() filters: BetFilterDto,
    @User('userId') userId: number,
  ) {
    return this.betService.getMonthlySummary({ ...filters, userId });
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
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  async finalizarMultiplas(
    @Body() body: FinalizarMultiplasDto,
    @User('userId') userId: number,
  ) {
    const { betIds, resultId } = body;
    return this.betService.finalizeMany(betIds, resultId, userId);
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
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  async finalizar(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: FinalizarApostaDto,
    @User('userId') userId: number,
  ) {
    return this.betService.finalizeBet(
      id,
      body.resultId,
      userId,
      body.cashoutValue,
    );
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
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  async deletarMultiplas(
    @Body() body: DeleteMultipleBetsDto,
    @User('userId') userId: number,
  ) {
    return this.betService.deleteManyBets(body.betIds, userId);
  }

  @Get('sports')
  // Lista global e estavel: pode ir pro cache da CDN (mesmo caso de /house/all).
  @Header('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400')
  @ApiOperation({ summary: 'Lista os esportes normalizados' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Lista de esportes.', type: [Object] })
  async getSports() {
    return this.betService.getSports();
  }

  @Get('result-types')
  @ApiOperation({ summary: 'Lista todos os tipos de resultados' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Lista de tipos de resultados retornada com sucesso.',
    type: [Object],
  })
  async getResultTypes() {
    return this.betService.getResultTypes();
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
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  async editar(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateData: UpdateApostaDto,
    @User('userId') userId: number,
  ) {
    return this.betService.updateBet(id, updateData, userId);
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
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  async deletar(
    @Param('id', ParseIntPipe) id: number,
    @User('userId') userId: number,
  ) {
    return this.betService.deleteBet(id, userId);
  }
}
