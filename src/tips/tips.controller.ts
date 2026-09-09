import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  ParseIntPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import {
  ApiBearerAuth,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { User } from '../common/decorators/user.decorator';
import { TipsService } from './tips.service';
import { PlanilharTipDto, TipFilterDto, TipsListResponseDto } from './dto/tip.dto';

@ApiTags('Tips')
@Controller('tips')
@UseGuards(AuthGuard('jwt'))
@ApiBearerAuth()
export class TipsController {
  constructor(private readonly tipsService: TipsService) {}

  @Get()
  @ApiOperation({
    summary: 'Lista as tips do canal para o usuário logado, já com os campos extraídos',
  })
  @ApiResponse({ status: HttpStatus.OK, type: TipsListResponseDto })
  async list(@Query() filters: TipFilterDto, @User('userId') userId: number) {
    return this.tipsService.listForUser(userId, filters);
  }

  @Post(':id/planilhar')
  @ApiOperation({
    summary: 'Cria a aposta a partir da tip, igual ao botão Planilhar do bot',
  })
  @ApiResponse({ status: HttpStatus.CREATED, description: 'Aposta criada.' })
  @ApiNotFoundResponse({ description: 'Tip não encontrada.' })
  async planilhar(
    @Param('id', ParseIntPipe) id: number,
    @Body() overrides: PlanilharTipDto,
    @User('userId') userId: number,
  ) {
    return this.tipsService.planilharTip(id, userId, overrides);
  }

  @Post(':id/dismiss')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Marca a tip como "caiu" (some das pendentes)' })
  @ApiNoContentResponse({ description: 'Tip marcada como caiu.' })
  @ApiNotFoundResponse({ description: 'Tip não encontrada.' })
  async dismiss(
    @Param('id', ParseIntPipe) id: number,
    @User('userId') userId: number,
  ) {
    const tip = await this.tipsService.findById(id);
    if (!tip) throw new NotFoundException('Tip não encontrada.');
    await this.tipsService.dismissTip(id, userId);
  }

  @Delete(':id/dismiss')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Desfaz o "caiu" e devolve a tip para as pendentes' })
  @ApiNoContentResponse({ description: 'Tip devolvida para as pendentes.' })
  async undismiss(
    @Param('id', ParseIntPipe) id: number,
    @User('userId') userId: number,
  ) {
    await this.tipsService.undismissTip(id, userId);
  }
}
