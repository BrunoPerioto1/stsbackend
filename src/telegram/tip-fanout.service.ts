import { Inject, Injectable } from '@nestjs/common';
import { Telegraf } from 'telegraf';
import { TELEGRAM_BOT } from './telegram-bot.provider';
import { UsersService } from '../users/users.service';
import { TipsService } from '../tips/tips.service';
import {
  TIP_BOILERPLATE_PATTERNS,
  extractLimitFromText,
  extractOddFromText,
  extractPercent,
  isAvisoMessage,
  stripBoilerplateParagraphs,
} from './tip-parsing.util';

// Tudo que envolve entregar uma tip pro DM individual de cada usuário: o
// fan-out ao vivo (quando a tip chega no grupo), o reenvio avulso de um item
// (botão "✏️ Editar" da lista do /pendentes) e a edição posterior dessa
// mensagem quando o usuário resolve pela lista em vez de clicar nela direto.
@Injectable()
export class TipFanoutService {
  private readonly tipsGroupChatId: number | null;

  constructor(
    @Inject(TELEGRAM_BOT) private readonly bot: Telegraf,
    private readonly usersService: UsersService,
    private readonly tipsService: TipsService,
  ) {
    const tipsGroupChatId = Number(process.env.TIPS_GROUP_CHAT_ID);
    this.tipsGroupChatId = Number.isFinite(tipsGroupChatId) && tipsGroupChatId !== 0 ? tipsGroupChatId : null;
    if (!this.tipsGroupChatId) {
      console.warn('⚠️  TIPS_GROUP_CHAT_ID não definido — o fan-out multiusuário do grupo Tips ficará desativado.');
    }
  }

  isTipsGroup(chatId: number): boolean {
    return this.tipsGroupChatId !== null && chatId === this.tipsGroupChatId;
  }

  tipsCopyKeyboard(tipId?: number) {
    const suffix = tipId !== undefined ? `:${tipId}` : '';
    return {
      inline_keyboard: [
        [{ text: '📊 Enviar ao Planilhador', callback_data: `planilhar${suffix}` }],
        [{ text: '✏️ Editar', callback_data: `editar${suffix}` }, { text: '❌ Aposta Caiu', callback_data: `aposta_caiu${suffix}` }],
      ],
    };
  }

  // Fan-out: dado o texto de uma tip postada no grupo Tips (chatId/messageId
  // dessa mensagem), extrai a %, e manda uma cópia com botão próprio de
  // Planilhar para cada usuário vinculado cujo filtro de % é satisfeito.
  // Mensagens de SOBRECARGA/AVISO passam mesmo sem % (mas sem recomendação,
  // já que não há % pra converter pela banca do usuário). Quando há %, cada
  // cópia leva sua própria "Recomendação de aposta" (banca do usuário × % da
  // tip, limitada pelo 🚦/limite do texto), em negrito. `entities` são os
  // links/formatação da mensagem original (ex.: "Clique AQUI" → text_link) —
  // sempre reconstruímos o texto (tira boilerplate, acrescenta recomendação),
  // então as entidades precisam ser realinhadas junto — senão a cópia perde
  // todo link/formatação.
  async handleTipsMessage(text: string, chatId: number, messageId: number, hasMedia: boolean, entities?: any[]) {
    const percent = extractPercent(text);
    const isAviso = isAvisoMessage(text);
    console.log(`📨 handleTipsMessage: percent=${percent} isAviso=${isAviso} hasMedia=${hasMedia}`);
    if (percent === null && !isAviso) return;

    const tip = await this.tipsService.recordTip({
      chatId,
      messageId,
      text,
      percent,
      isAviso,
      hasMedia,
      entities: entities ?? null,
    });

    const users = await this.usersService.getUsersForTipsFanout();
    const limit = extractLimitFromText(text);
    const { text: baseText, entities: baseEntities } = stripBoilerplateParagraphs(text, entities, TIP_BOILERPLATE_PATTERNS);

    for (const user of users) {
      if (percent !== null && user.minPercentFilter !== null && percent < Number(user.minPercentFilter)) continue;

      const stillMember = await this.isTipsGroupMember(user.telegramUserId as number);
      if (!stillMember) continue;

      await this.sendTipCopyToUser(user, tip, chatId, messageId, hasMedia, baseText, baseEntities, text, limit);
    }
  }

  // Manda a cópia individual de uma tip (com recomendação de aposta calculada
  // pra banca/filtro do usuário) — usado tanto pelo fan-out ao vivo quanto
  // pelo reenvio avulso de um item do /pendentes (resendTipCard). `tip` só
  // precisa de id e percent; texto/casa/odd sempre vêm recalculados a partir
  // de baseText/originalText, nunca de campos extras da tip.
  async sendTipCopyToUser(
    user: { id: number; telegramUserId: number | null },
    tip: { id: number; percent: number | null },
    chatId: number,
    messageId: number,
    hasMedia: boolean,
    baseText: string,
    baseEntities: any,
    originalText: string,
    limit: number | null,
  ) {
    let outgoingText = baseText;
    let outgoingEntities: any = baseEntities;
    // NUMERIC do Postgres volta como string via pg — mesmo pra uma tip que
    // acabou de ser inserida com um number — então normaliza antes de fazer
    // conta com isso (division/toFixed em cima de string não estoura, mas
    // .toFixed(2) e comparações mais adiante esperam number de verdade).
    const percent = tip.percent !== null ? Number(tip.percent) : null;
    try {
      if (percent !== null) {
        const userStake = await this.usersService.getUserStake(user.id);
        let recommendedStake = (percent / 100) * userStake;
        if (limit !== null) recommendedStake = Math.min(recommendedStake, limit);

        const recommendationValue = recommendedStake.toFixed(2).replace('.', ',');
        const recommendationLine = `🎯 Recomendação de aposta: R$ ${recommendationValue}`;
        outgoingEntities = [
          ...(baseEntities ?? []),
          { type: 'bold', offset: baseText.length + 2, length: recommendationLine.length },
        ];

        const odd = extractOddFromText(originalText);
        if (odd !== null) {
          const lucroValue = (recommendedStake * odd - recommendedStake).toFixed(2).replace('.', ',');
          const lucroLine = `💰 Lucro potencial: R$ ${lucroValue}`;
          outgoingText = `${baseText}\n\n${recommendationLine}\n${lucroLine}`;
          outgoingEntities.push({
            type: 'bold',
            offset: baseText.length + 2 + recommendationLine.length + 1,
            length: lucroLine.length,
          });
        } else {
          outgoingText = `${baseText}\n\n${recommendationLine}`;
        }
        console.log(
          `🎯 Recomendação calculada (userId=${user.id}, telegramUserId=${user.telegramUserId}): banca=${userStake} percent=${percent} limit=${limit} -> R$${recommendationValue}`,
        );
      }

      const sent = hasMedia
        ? await this.bot.telegram.copyMessage(user.telegramUserId as number, chatId, messageId, {
            caption: outgoingText,
            caption_entities: outgoingEntities,
            reply_markup: this.tipsCopyKeyboard(tip.id),
          })
        : await this.bot.telegram.sendMessage(user.telegramUserId as number, outgoingText, {
            entities: outgoingEntities,
            reply_markup: this.tipsCopyKeyboard(tip.id),
          });

      // Guarda essa cópia (texto/entidades exatos) pra dar pra editar depois
      // — é o que permite o /pendentes marcar "✅ PLANILHADO"/"❌ APOSTA CAIU"
      // direto na mensagem que o usuário recebeu, mesmo resolvendo pela lista
      // em vez de clicar na mensagem original.
      await this.tipsService.saveDelivery({
        tipId: tip.id,
        userId: user.id,
        messageId: sent.message_id,
        hasMedia,
        text: outgoingText,
        entities: outgoingEntities ?? null,
      });
    } catch (err) {
      console.error(`⚠️ Não foi possível enviar tip para o usuário (telegramUserId=${user.telegramUserId}):`, err);
    }
  }

  // Reenvia uma única tip (a pedido do botão "✏️ Editar" da lista) como o
  // card completo de sempre — reaproveita sendTipCopyToUser, então ganha o
  // mesmo Planilhar/Editar/Aposta Caiu que a tip teria tido na hora que
  // chegou no grupo.
  async resendTipCard(user: { id: number; telegramUserId: number | null }, tipId: number): Promise<boolean> {
    const tip = await this.tipsService.findById(tipId);
    if (!tip) return false;

    const { text: baseText, entities: baseEntities } = stripBoilerplateParagraphs(
      tip.text,
      tip.entities ?? undefined,
      TIP_BOILERPLATE_PATTERNS,
    );
    const limit = extractLimitFromText(tip.text);
    await this.sendTipCopyToUser(user, tip, tip.chatId, tip.messageId, tip.hasMedia, baseText, baseEntities, tip.text, limit);
    return true;
  }

  // Edita a última cópia de DM conhecida pra essa (tip, usuário) — marca o
  // mesmo banner "✅ PLANILHADO"/"❌ APOSTA CAIU" que já aparece quando se
  // clica direto na mensagem, só que a partir da ação feita na lista do
  // /pendentes. Sem delivery salva (tip antiga, de antes dessa mudança) não
  // tem o que editar — segue sem erro, só não atualiza a mensagem original.
  async markDeliveredMessage(
    user: { id: number; telegramUserId: number | null },
    tipId: number,
    kind: 'planilhado' | 'caiu',
  ) {
    if (!user.telegramUserId) return;
    try {
      const delivery = await this.tipsService.findDelivery(tipId, user.id);
      if (!delivery) return;

      const prefix = kind === 'caiu' ? '❌ APOSTA CAIU' : '✅ PLANILHADO';
      const novoTexto = `${prefix}\n\n${delivery.text}`;
      const keyboard =
        kind === 'caiu'
          ? { inline_keyboard: [[{ text: '↩️ Voltar', callback_data: `voltar:${tipId}` }]] }
          : { inline_keyboard: [[{ text: '✅ Planilhado', callback_data: 'done' }]] };

      if (delivery.hasMedia) {
        await this.bot.telegram.editMessageCaption(user.telegramUserId, delivery.messageId, undefined, novoTexto, {
          reply_markup: keyboard,
        });
      } else {
        await this.bot.telegram.editMessageText(user.telegramUserId, delivery.messageId, undefined, novoTexto, {
          reply_markup: keyboard,
        });
      }
    } catch (err) {
      console.error(`⚠️ Não foi possível atualizar a mensagem original da tip (tipId=${tipId}):`, err);
    }
  }

  // Só manda tip pra quem ainda está no grupo Tips — evita continuar mandando
  // DM pra quem já vinculou a conta um dia mas saiu do grupo depois.
  private async isTipsGroupMember(telegramUserId: number): Promise<boolean> {
    if (!this.tipsGroupChatId) return true;
    try {
      const member = await this.bot.telegram.getChatMember(this.tipsGroupChatId, telegramUserId);
      return member.status !== 'left' && member.status !== 'kicked';
    } catch (err) {
      console.error(`⚠️ Não foi possível checar membro do grupo Tips (telegramUserId=${telegramUserId}):`, err);
      return false;
    }
  }
}
