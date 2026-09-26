import { Controller, HttpCode, HttpStatus, Inject, Logger, Post, UseGuards } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { Telegraf } from 'telegraf';
import { TELEGRAM_BOT } from '../telegram/telegram-bot.provider';
import { UsersRepository } from '../infra/repository/users.repository';
import { CronGuard } from '../common/guards/cron.guard';
import { frontUrl } from '../common/utils/front-url';
import { SettlementService } from './settlement.service';

/**
 * Chamado pelo job de placar (sofascore-results.yml) logo depois de gravar os
 * resultados. Calcula as sugestões de todo mundo e avisa no Telegram quem
 * ganhou proposta nova — o badge do menu deixa de depender de alguém abrir a
 * tela e clicar. Não grava resultado: a confirmação continua sendo do usuário.
 */
@ApiExcludeController()
@Controller('settlement/cron')
@UseGuards(CronGuard)
export class SettlementCronController {
  private readonly logger = new Logger(SettlementCronController.name);

  constructor(
    private readonly settlementService: SettlementService,
    private readonly usersRepository: UsersRepository,
    @Inject(TELEGRAM_BOT) private readonly bot: Telegraf,
  ) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  async run() {
    const comNovidade = await this.settlementService.computeForAllUsers();
    let notified = 0;

    for (const { userId } of comNovidade) {
      const user = await this.usersRepository.findById(userId);
      if (!user?.telegramUserId || user.isActive === false) continue;
      // O total esperando, não só as novas: é o número que o badge mostra.
      const { suggestions } = await this.settlementService.queue(userId);
      if (!suggestions) continue;
      try {
        await this.bot.telegram.sendMessage(
          user.telegramUserId,
          `📋 ${suggestions} ${suggestions === 1 ? 'aposta pronta' : 'apostas prontas'} pra conferir.\n` +
            'O placar já chegou; nada vira lucro até você confirmar.',
          {
            reply_markup: {
              inline_keyboard: [[{ text: '✅ Conferir', url: frontUrl('/settlement') }]],
            },
          },
        );
        notified++;
      } catch (error) {
        this.logger.warn(`aviso de conferencia falhou (userId=${userId}): ${(error as Error).message}`);
      }
    }

    this.logger.log(`cron: ${comNovidade.length} usuarios com proposta nova, ${notified} avisados`);
    return { users: comNovidade.length, notified };
  }
}
