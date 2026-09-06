import { Controller, Post, Param, Req, Res } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { Request, Response } from 'express';
import * as dotenv from 'dotenv';
import { TelegramService } from './telegram.service';

dotenv.config();

@ApiExcludeController()
@Controller('telegram')
export class TelegramController {
  constructor(private readonly telegramService: TelegramService) {}

  @Post(':token')
  async handleUpdate(
    @Param('token') token: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    if (token !== process.env.TELEGRAM_BOT_TOKEN) {
      return res.status(403).send('Forbidden');
    }

    const startedAt = performance.now();
    let status = 'ok';
    try {
      await this.telegramService.bot.handleUpdate(req.body);
    } catch (error) {
      status = 'error';
      console.error('Erro ao processar update do Telegram:', error);
    } finally {
      console.log(
        `[TELEGRAM_WEBHOOK] update_id=${req.body?.update_id ?? '?'} status=${status} duration_ms=${Math.round(performance.now() - startedAt)}`,
      );
    }

    return res.status(200).send('ok');
  }
}
