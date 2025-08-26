import { Injectable, OnModuleInit } from '@nestjs/common';
import { Telegraf } from 'telegraf';
import * as dotenv from 'dotenv';
import { GrokService } from './grok.service';
import { ApostaService } from '../aposta/aposta.service';
import { CreateApostaDto } from '../aposta/dto/create-aposta.dto';
dotenv.config();

@Injectable()
export class TelegramService implements OnModuleInit {
  private bot: Telegraf;

  constructor(
    private readonly grokService: GrokService,
    private readonly apostaService: ApostaService,
  ) {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) throw new Error('❌ TELEGRAM_BOT_TOKEN não definido no .env');

    this.bot = new Telegraf(token);
  }

  onModuleInit() {
    this.bot.on('message', async (ctx) => {
      const msg = ctx.message as any;
      const isForwarded = !!msg.forward_from || !!msg.forward_from_chat;
      const userMessage = msg.text ?? msg.caption;

      if (!userMessage) return;

      if (isForwarded) {
        console.log('Mensagem encaminhada detectada:', userMessage);
      }

      try {
        const jsonResult = await this.grokService.parseBetMessage(userMessage);

        // 🔥 Mapear campos corretamente antes de salvar no banco!
        const apostaData: CreateApostaDto = {
          jogo: jsonResult.jogo,
          stake: jsonResult.stake,
          odd: jsonResult.odd,
          casa: jsonResult.casa, // Nome da casa para compatibilidade
          casa_id: jsonResult.casa_id, // ID da casa para relacionamento
          mercado: jsonResult.mercado,
          esporte: jsonResult.esporte,
          data_hora: jsonResult.data_hora || jsonResult.data || new Date().toISOString(),
        };

        // 🔥 Aqui salva no banco!
        const aposta = await this.apostaService.criarAposta(apostaData);

        await ctx.reply(
          `✅ Aposta salva no DB!\n\n📊 JSON:\n\`\`\`json\n${JSON.stringify(
            aposta,
            null,
            2,
          )}\n\`\`\``,
          { parse_mode: 'Markdown' },
        );
      } catch (err) {
        console.error('❌ Erro ao processar a mensagem:', err);
        await ctx.reply('❌ Erro ao processar sua aposta.');
      }
    });

    this.bot.launch();
    console.log('🤖 Telegram bot iniciado...');
  }
}
