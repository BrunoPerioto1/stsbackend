import { Controller, Get, Post, Body, Patch, Param, Delete, Query } from '@nestjs/common';
import { CasaService } from './casa.service';
import { CreateCasaDto } from './create-casa.dto';
import { UpdateCasaDto } from './update-casa.dto';
import { CreateTransacaoDto } from './create-transacao.dto';

@Controller('casa')
export class CasaController {
  constructor(private readonly casaService: CasaService) {}

  @Post()
  criarCasa(@Body() createCasaDto: CreateCasaDto) {
    return this.casaService.criarCasa(createCasaDto);
  }

  @Get()
  listarTodasCasas() {
    return this.casaService.listarTodasCasas();
  }

  @Get('saldos')
  calcularSaldosTodasCasas() {
    return this.casaService.calcularSaldosTodasCasas();
  }

  @Get('resolver')
  resolverCasaPorTexto(@Query('texto') texto: string) {
    return this.casaService.resolverCasaPorTexto(texto);
  }

  @Get(':id')
  buscarCasaPorId(@Param('id') id: string) {
    return this.casaService.buscarCasaPorId(+id);
  }

  @Get(':id/saldo')
  calcularSaldoPorCasa(@Param('id') id: string) {
    return this.casaService.calcularSaldoPorCasa(+id);
  }

  @Patch(':id')
  atualizarCasa(@Param('id') id: string, @Body() updateCasaDto: UpdateCasaDto) {
    return this.casaService.atualizarCasa(+id, updateCasaDto);
  }

  @Delete(':id')
  deletarCasa(@Param('id') id: string) {
    return this.casaService.deletarCasa(+id);
  }

  // Rotas para transações
  @Post('transacao')
  criarTransacao(@Body() createTransacaoDto: CreateTransacaoDto) {
    return this.casaService.criarTransacao(createTransacaoDto);
  }

  @Get('transacoes')
  listarTodasTransacoes() {
    return this.casaService.listarTodasTransacoes();
  }

  @Get(':id/transacoes')
  listarTransacoesPorCasa(@Param('id') id: string) {
    return this.casaService.listarTransacoesPorCasa(+id);
  }
}