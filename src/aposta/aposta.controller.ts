import { Controller, Post, Put, Body, Param, Get, ParseIntPipe, HttpCode, HttpStatus } from '@nestjs/common';
import { ApostaService } from './aposta.service';
import { ResultIdEnum } from './result-id.enum'; // Importe o Enum

@Controller('apostas')
export class ApostaController {
  constructor(private readonly apostaService: ApostaService) {}

  // Criar aposta
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async criar(@Body() apostaData: {
    jogo: string;
    stake: number;
    odd: number;
    casa: string;
    mercado: string;
    esporte: string;
  }) {
    return this.apostaService.criarAposta(apostaData);
  }

  // Finalizar uma aposta individual
  @Put('finalizar/:id')
  async finalizar(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { resultId: ResultIdEnum },
  ) {
    return this.apostaService.finalizarAposta(id, body.resultId);
  }

  // Finalizar múltiplas apostas
  @Put('finalizar-multiplas')
  async finalizarMultiplas(@Body() body: { apostaIds: number[], resultId: ResultIdEnum }) {
    const { apostaIds, resultId } = body;
    return this.apostaService.finalizarMultiplas(apostaIds, resultId);
  }

  // Buscar todas as apostas (rota unificada)
  @Get()
  async listarTodas() {
    return this.apostaService.listarTodasApostas();
  }

  // Buscar aposta individual (rota unificada)
  @Get(':id')
  async buscar(@Param('id', ParseIntPipe) id: number) {
    return this.apostaService.buscarApostaPorId(id);
  }
}