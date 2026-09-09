import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { User } from '../common/decorators/user.decorator';
import { UserId } from '../db_types/Users';
import { BetId } from '../db_types/Bet';
import { SettlementService } from './settlement.service';
import {
  ConfirmSettlementDto,
  SettlementSuggestionDto,
} from './dto/settlement.dto';

@ApiTags('Liquidação')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('settlement')
export class SettlementController {
  constructor(private readonly settlementService: SettlementService) {}

  @Post('compute')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Recalcula as sugestões das apostas pendentes já encerradas',
    description:
      'Não altera nenhum resultado: apenas prepara as sugestões que a tela ' +
      'de conferência exibe. Depende do job jobs/sofascore/results.py ter ' +
      'trazido o placar.',
  })
  compute(@User('userId') userId: number) {
    return this.settlementService.computeSuggestions(userId as UserId);
  }

  @Get('suggestions')
  @ApiOperation({ summary: 'Lista as sugestões aguardando confirmação' })
  @ApiResponse({ status: HttpStatus.OK, type: [SettlementSuggestionDto] })
  list(@User('userId') userId: number) {
    return this.settlementService.listSuggestions(userId as UserId);
  }

  @Post('confirm')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Planilha as sugestões aceitas',
    description:
      'Único caminho pelo qual a liquidação automática vira resultado real. ' +
      'Usa o mesmo fluxo de finalização manual, com o mesmo cálculo de lucro.',
  })
  confirm(
    @Body() body: ConfirmSettlementDto,
    @User('userId') userId: number,
  ) {
    return this.settlementService.confirm(
      body.betIds as BetId[],
      userId as UserId,
    );
  }

  @Post('dismiss')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Descarta sugestões que o usuário não quer aceitar',
    description: 'A aposta segue pendente e a sugestão não volta a aparecer.',
  })
  dismiss(@Body() body: ConfirmSettlementDto, @User('userId') userId: number) {
    return this.settlementService.dismiss(
      body.betIds as BetId[],
      userId as UserId,
    );
  }
}
