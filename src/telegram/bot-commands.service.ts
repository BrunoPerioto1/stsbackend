import { Injectable } from '@nestjs/common';
import { UsersService } from '../users/users.service';
import { PendentesService } from './pendentes.service';
import { UNLINKED_INSTRUCTIONS } from './tip-parsing.util';

// Os comandos "simples" do bot — cada um só conversa com o usuário que
// chamou, sem envolver fan-out de tips nem callback_query.
@Injectable()
export class BotCommandsService {
  constructor(
    private readonly usersService: UsersService,
    private readonly pendentesService: PendentesService,
  ) {}

  async handleStart(ctx: any) {
    await ctx.reply(
      '👋 Bem-vindo!\n\n' +
        '1️⃣ Vincule sua conta: faça login em https://stsfront.vercel.app/login → Perfil → "Vincular Telegram", copie o código e envie /vincular SEU_CODIGO\n' +
        '2️⃣ Defina sua banca: /stake VALOR\n' +
        '3️⃣ (Opcional) Defina o filtro de porcentagem mínima das tips que você quer receber: /filtro 1.5\n' +
        '   Use /filtro off para remover o filtro e receber todas as tips.\n\n' +
        'Depois disso, as apostas do grupo Tips que baterem seu filtro chegam aqui, com um botão para planilhar.\n\n' +
        '📋 Use /pendentes a qualquer momento pra ver quais tips ainda faltam planilhar.',
    );
  }

  // /pendentes: resumo do que ainda falta planilhar (ou marcar como aposta
  // caiu), sem limite de data — uma tip só sai da lista quando você resolve
  // ela, senão ficaria perdida pra sempre se passasse batido no dia em que
  // chegou.
  async handlePendentes(ctx: any) {
    try {
      const user = await this.usersService.findByTelegramUserId(ctx.from.id);
      if (!user) {
        await ctx.reply(UNLINKED_INSTRUCTIONS);
        return;
      }
      const { text, keyboard } = await this.pendentesService.buildMessage(user);
      await ctx.reply(text, {
        parse_mode: 'HTML',
        link_preview_options: { is_disabled: true },
        reply_markup: keyboard,
      });
    } catch (err) {
      console.error('❌ Erro ao buscar pendentes:', err);
      await ctx.reply('❌ Erro ao buscar tips pendentes. Tente novamente.');
    }
  }

  // /site: link direto pro dashboard do app.
  async handleSite(ctx: any) {
    await ctx.reply('📊 Site: https://stsfront.vercel.app');
  }

  async handleFiltro(ctx: any) {
    const args = ctx.message.text.split(' ');
    const telegramUserId = ctx.from.id;

    try {
      const user = await this.usersService.findByTelegramUserId(telegramUserId);
      if (!user) {
        await ctx.reply(UNLINKED_INSTRUCTIONS);
        return;
      }

      if (args.length !== 2 || args[1].toLowerCase() === 'off') {
        if (args.length === 2 && args[1].toLowerCase() === 'off') {
          await this.usersService.setMinPercentFilter(telegramUserId, null);
          await ctx.reply('✅ Filtro removido. Você vai receber todas as tips do grupo.');
          return;
        }
        await ctx.reply('❌ Formato incorreto. Use: /filtro VALOR (ex.: /filtro 1.5) ou /filtro off');
        return;
      }

      const value = Number(args[1].replace(',', '.'));
      if (!Number.isFinite(value) || value < 0) {
        await ctx.reply('❌ Valor inválido. Informe um número maior ou igual a zero.');
        return;
      }

      await this.usersService.setMinPercentFilter(telegramUserId, value);
      await ctx.reply(`✅ Filtro definido: só chegam tips com porcentagem >= ${value}%`);
    } catch (error) {
      console.error('Erro ao atualizar filtro:', error);
      await ctx.reply('❌ Erro ao atualizar seu filtro. Tente novamente.');
    }
  }

  async handleStake(ctx: any) {
    const args = ctx.message.text.split(' ');
    if (args.length !== 2) {
      await ctx.reply('❌ Formato incorreto. Use: /stake VALOR\nExemplo: /stake 2000');
      return;
    }

    const value = Number(args[1].replace(/[.,]/g, ''));
    if (!Number.isFinite(value) || value <= 0) {
      await ctx.reply('❌ Valor inválido. Informe um número maior que zero.');
      return;
    }

    try {
      const user = await this.usersService.findByTelegramUserId(ctx.from.id);
      if (!user) {
        await ctx.reply(UNLINKED_INSTRUCTIONS);
        return;
      }

      await this.usersService.updateUserStake(user.id, value);

      await ctx.reply(`✅ Banca definida: R$ ${value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`);
    } catch (error) {
      console.error('Erro ao atualizar stake:', error);
      await ctx.reply('❌ Erro ao atualizar sua banca. Tente novamente.');
    }
  }

  async handleVincular(ctx: any) {
    const args = ctx.message.text.split(' ');
    if (args.length !== 2) {
      await ctx.reply('❌ Formato incorreto. Use: /vincular SEU_CODIGO');
      return;
    }

    const code = args[1];
    const telegramUserId = ctx.from.id;

    try {
      const url = `${process.env.API_URL || 'http://localhost:4000'}/auth/link-telegram/confirm`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, telegramUserId }),
      });

      const result: any = await response.json();

      if (result.success) {
        await ctx.reply('✅ Conta vinculada com sucesso!');
      } else {
        await ctx.reply('❌ Erro: ' + result.message);
      }
    } catch (error) {
      console.error('Erro ao confirmar vinculação:', error);
      await ctx.reply('❌ Erro ao processar solicitação. Tente mais tarde.');
    }
  }
}
