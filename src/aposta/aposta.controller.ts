import {
  Controller,
  Post,
  Put,
  Body,
  Param,
  Get,
  ParseIntPipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApostaService } from './aposta.service';
import { CreateApostaDto } from './dto/create-aposta.dto';
import { UpdateApostaDto } from './dto/update-aposta.dto';
import {
  FinalizarApostaDto,
  FinalizarMultiplasDto,
} from './dto/finalizar-aposta.dto';

@Controller('apostas')
export class ApostaController {
  constructor(private readonly apostaService: ApostaService) {}

  // Criar aposta
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async criar(@Body() apostaData: CreateApostaDto) {
    return this.apostaService.criarAposta(apostaData);
  }

  // Editar aposta
  @Put(':id')
  async editar(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateData: UpdateApostaDto,
  ) {
    console.log('Controller - Dados recebidos para edição:', updateData);
    console.log('Controller - ID da aposta:', id);
    return this.apostaService.editarAposta(id, updateData);
  }

  // Finalizar uma aposta individual
  @Put('finalizar/:id')
  async finalizar(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: FinalizarApostaDto,
  ) {
    return this.apostaService.finalizarAposta(id, body.resultId);
  }

  // Finalizar múltiplas apostas
  @Put('finalizar-multiplas')
  async finalizarMultiplas(@Body() body: FinalizarMultiplasDto) {
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

  // Listar casas únicas para filtro
  @Get('casas/lista')
  async listarCasas() {
    return this.apostaService.listarCasasUnicas();
  }
}
