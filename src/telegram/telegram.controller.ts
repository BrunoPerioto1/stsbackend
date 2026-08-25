import { Controller, Post, Param, Req, Res } from '@nestjs/common';
import { Request, Response } from 'express';
import * as dotenv from 'dotenv';
import { TelegramService } from './telegram.service';

dotenv.config();


@Controller('telegram')
export class TelegramController {
  constructor(private readonly telegramService: TelegramService) {}

  @Post(':token')
  async handleUpdate(@Param('token') token: string, @Req() req: Request, @Res() res: Response) {
    if (token !== process.env.TELEGRAM_BOT_TOKEN) {
      return res.status(403).send('Forbidden');
    }

    try {
      await this.telegramService.bot.handleUpdate(req.body);
    } catch (error) {
      console.error('Erro ao processar update do Telegram:', error);
    }

    return res.status(200).send('ok');
  }
}
