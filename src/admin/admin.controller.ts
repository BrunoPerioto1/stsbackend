import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Put,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { AdminService, MAX_HOUSE_LOGO_BYTES } from './admin.service';
import {
  CreateAdminHouseDTO,
  CreateScannerTournamentDTO,
  UpdateAdminHouseDTO,
  UpdateAdminUserDTO,
  UpdateScannerFlagsDTO,
} from './dto/admin.dto';
import { ScannerService } from './scanner.service';
import { AdminGuard } from '../common/guards/admin.guard';
import { User } from '../common/decorators/user.decorator';
import { TipSourcesService } from '../tip-sources/tip-sources.service';
import {
  CreateTipSourceDTO,
  PreviewTipSourceDTO,
  UpdateTipSourceDTO,
} from '../tip-sources/dto/tip-source.dto';

@ApiTags('admin')
@Controller('admin')
// Os dois guards no controller inteiro: não existe rota daqui que um não-admin
// possa ver. Decorar por método seria uma chance a mais de esquecer.
@UseGuards(AuthGuard('jwt'), AdminGuard)
@ApiBearerAuth('jwt')
export class AdminController {
  constructor(
    private readonly adminService: AdminService,
    private readonly scannerService: ScannerService,
    private readonly tipSourcesService: TipSourcesService,
  ) {}

  @Get('overview')
  @ApiOperation({ summary: 'Saúde do pipeline: Telegram → tip → fan-out → coletor → liquidação' })
  @ApiResponse({ status: 200, description: 'Estado atual de cada etapa.' })
  overview(@User('userId') userId: number) {
    return this.adminService.overview(userId);
  }

  @Get('users')
  @ApiOperation({ summary: 'Lista todos os usuários com papel, bloqueio e contagem de apostas' })
  listUsers() {
    return this.adminService.listUsers();
  }

  @Get('houses')
  @ApiOperation({ summary: 'Casas de aposta com apelidos e contagem de apostas (inclui inativas)' })
  listHouses() {
    return this.adminService.listHouses();
  }

  @Post('houses')
  @ApiOperation({ summary: 'Cadastra uma casa de aposta com seus apelidos' })
  createHouse(@Body() dto: CreateAdminHouseDTO) {
    return this.adminService.createHouse(dto);
  }

  @Patch('houses/:id')
  @ApiOperation({ summary: 'Renomeia, troca apelidos ou (des)ativa uma casa' })
  updateHouse(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateAdminHouseDTO) {
    return this.adminService.updateHouse(id, dto);
  }

  @Put('houses/:id/logo')
  @ApiOperation({ summary: 'Troca o avatar da casa (PNG, JPEG ou WebP; o front manda já em 128px)' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', properties: { logo: { type: 'string', format: 'binary' } } } })
  @UseInterceptors(FileInterceptor('logo', { limits: { fileSize: MAX_HOUSE_LOGO_BYTES, files: 1 } }))
  setHouseLogo(@Param('id', ParseIntPipe) id: number, @UploadedFile() file: { buffer?: Buffer } | undefined) {
    return this.adminService.setHouseLogo(id, file?.buffer);
  }

  @Delete('houses/:id/logo')
  @ApiOperation({ summary: 'Remove o avatar da casa (volta às iniciais)' })
  removeHouseLogo(@Param('id', ParseIntPipe) id: number) {
    return this.adminService.removeHouseLogo(id);
  }

  @Patch('users/:id')
  @ApiOperation({ summary: 'Muda papel, desbloqueia ou desvincula o Telegram de um usuário' })
  updateUser(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateAdminUserDTO,
    @User('userId') requesterId: number,
  ) {
    return this.adminService.updateUser(requesterId, id, dto);
  }

  @Get('scanner')
  @ApiOperation({ summary: 'Competições do scanner do SofaScore, o que ele busca de cada uma e a última coleta' })
  listScanner() {
    return this.scannerService.list();
  }

  @Get('scanner/:id/sample')
  @ApiOperation({ summary: 'O que a competição entrega: resumo do último jogo encerrado (amostra.py)' })
  scannerSample(@Param('id', ParseIntPipe) id: number) {
    return this.scannerService.sample(id);
  }

  @Post('scanner')
  @ApiOperation({ summary: 'Põe um torneio do SofaScore no scanner (id do fim da URL do torneio)' })
  createScanner(@Body() dto: CreateScannerTournamentDTO) {
    return this.scannerService.create(dto);
  }

  @Patch('scanner/sports/:sportId')
  @ApiOperation({ summary: 'Aplica as flags a todas as competições atuais do esporte (não fica salvo no esporte)' })
  updateScannerSport(@Param('sportId', ParseIntPipe) sportId: number, @Body() dto: UpdateScannerFlagsDTO) {
    return this.scannerService.updateSport(sportId, dto);
  }

  @Patch('scanner/:id')
  @ApiOperation({ summary: 'Liga/desliga a coleta ou um dado extra de uma competição' })
  updateScanner(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateScannerFlagsDTO) {
    return this.scannerService.update(id, dto);
  }

  @Delete('scanner/:id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Tira a competição do scanner (apostas dela voltam a buscar tudo)' })
  deleteScanner(@Param('id', ParseIntPipe) id: number) {
    return this.scannerService.remove(id);
  }

  @Get('sources')
  @ApiOperation({ summary: 'Fontes de tips com o modelo de cada uma e o que renderam na semana' })
  listSources() {
    return this.tipSourcesService.list();
  }

  @Post('sources/preview')
  @HttpCode(200)
  @ApiOperation({ summary: 'Lê uma mensagem com o modelo: campos, card do usuário e conflito com outros formatos' })
  previewSource(@Body() dto: PreviewTipSourceDTO) {
    return this.tipSourcesService.preview(dto);
  }

  @Post('sources')
  @ApiOperation({ summary: 'Cadastra uma fonte de tips e o modelo das mensagens dela' })
  createSource(@Body() dto: CreateTipSourceDTO) {
    return this.tipSourcesService.create(dto);
  }

  @Patch('sources/:id')
  @ApiOperation({ summary: 'Troca nome, modelo ou exemplo, ou pausa/reativa a fonte' })
  updateSource(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateTipSourceDTO) {
    return this.tipSourcesService.update(id, dto);
  }

  @Delete('sources/:id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Apaga a fonte (as tips que ela leu ficam, já traduzidas)' })
  deleteSource(@Param('id', ParseIntPipe) id: number) {
    return this.tipSourcesService.remove(id);
  }
}
