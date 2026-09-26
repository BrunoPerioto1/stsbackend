import { Controller, Headers, Logger, Param, Post, Req, Res } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { timingSafeEqual } from 'crypto';
import { Request, Response } from 'express';
import { TelegramService } from './telegram.service';
import { errorArgs } from '../common/utils/log';

const sameSecret = (received: string | undefined, expected: string | undefined) =>
  !!received &&
  !!expected &&
  received.length === expected.length &&
  timingSafeEqual(Buffer.from(received), Buffer.from(expected));

@ApiExcludeController()
@Controller('telegram')
export class TelegramController {
  private readonly logger = new Logger(TelegramController.name);

  constructor(private readonly telegramService: TelegramService) {}

  /**
   * Webhook. O Telegram manda o `secret_token` do setWebhook no header
   * X-Telegram-Bot-Api-Secret-Token. Antes o próprio token do bot ia na URL
   * (/telegram/<token>) e aparecia em todo log de request da Vercel.
   */
  @Post()
  async handleUpdate(
    @Headers('x-telegram-bot-api-secret-token') secret: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    if (!sameSecret(secret, process.env.TELEGRAM_WEBHOOK_SECRET)) {
      return res.status(403).send('Forbidden');
    }
    return this.process(req, res);
  }

  /**
   * URL antiga, com o token no caminho. Só existe pra o bot não cair entre o
   * deploy e o `npm run telegram:webhook` que registra a URL nova; depois disso
   * o Telegram não chama mais aqui. Com TELEGRAM_WEBHOOK_SECRET definido e o
   * webhook novo registrado, dá pra apagar.
   */
  @Post(':token')
  async handleLegacyUpdate(@Param('token') token: string, @Req() req: Request, @Res() res: Response) {
    if (!sameSecret(token, process.env.TELEGRAM_BOT_TOKEN)) {
      return res.status(403).send('Forbidden');
    }
    this.logger.warn('webhook pela URL antiga (token no caminho): rode npm run telegram:webhook');
    return this.process(req, res);
  }

  private async process(req: Request, res: Response) {
    const startedAt = performance.now();
    let status = 'ok';
    try {
      await this.telegramService.bot.handleUpdate(req.body);
    } catch (error) {
      status = 'error';
      this.logger.error(...errorArgs('Erro ao processar update do Telegram', error));
    } finally {
      this.logger.log(
        `[TELEGRAM_WEBHOOK] update_id=${(req.body as { update_id?: number } | undefined)?.update_id ?? '?'} status=${status} duration_ms=${Math.round(performance.now() - startedAt)}`,
      );
    }

    return res.status(200).send('ok');
  }
}
