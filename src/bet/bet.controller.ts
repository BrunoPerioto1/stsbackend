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
  BetItem,
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
    return this.betService.createBet({ ...apostaData, userId });
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
