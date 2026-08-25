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

  // Chamado pelo bot.js (repasse) logo após postar uma tip no grupo Tips.
  // Necessário porque o Telegram não entrega updates de mensagens postadas
  // por OUTRO bot — só o próprio bot.js sabe o texto + message_id certos.
  @Post('tips-fanout/:token')
  async handleTipsFanout(@Param('token') token: string, @Req() req: Request, @Res() res: Response) {
    if (token !== process.env.TELEGRAM_BOT_TOKEN) {
      return res.status(403).send('Forbidden');
    }

    const { chatId, messageId, text } = req.body ?? {};
    if (!chatId || !messageId || !text) {
      return res.status(400).json({ ok: false, error: 'chatId, messageId e text são obrigatórios' });
    }

    try {
      await this.telegramService.handleTipsMessage(text, Number(chatId), Number(messageId));
    } catch (error) {
      console.error('Erro ao processar fan-out de tip:', error);
      return res.status(500).json({ ok: false });
    }

    return res.status(200).json({ ok: true });
  }
}
