import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { v4 as uuidv4 } from 'uuid';
import { UsersService } from './users.service';

// Simples in-memory store para exemplo (substitua por cache/DB em produção)
const telegramLinkCodes: Record<string, number> = {};

@Controller('auth')
export class TelegramLinkController {
  constructor(private readonly usersService: UsersService) {}
  // Gera um código de vinculação para o usuário autenticado
  @UseGuards(AuthGuard('jwt'))
  @Post('link-telegram')
  generateLinkCode(@Req() req) {
    const userId = req.user.userId;
    const code = uuidv4();
    telegramLinkCodes[code] = userId;
    return { code };
  }

  // Endpoint para o bot validar o código e vincular o Telegram userId
  @Post('link-telegram/confirm')
  async confirmLink(@Body() body: { code: string; telegramUserId: number }) {
    const { code, telegramUserId } = body;
    const userId = telegramLinkCodes[code];
    
    if (!userId) {
      return { success: false, message: 'Código inválido ou expirado.' };
    }

    try {
      await this.usersService.vincularTelegram(userId, telegramUserId);
      delete telegramLinkCodes[code];
      return { success: true, message: 'Telegram vinculado com sucesso!', userId, telegramUserId };
    } catch (error) {
      return { success: false, message: 'Erro ao vincular Telegram: ' + error.message };
    }
  }
}
