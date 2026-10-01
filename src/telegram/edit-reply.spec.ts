import { BetTextService } from './bet-text.service';
import {
  EDIT_PROMPT_HEADER_RE,
  EDIT_PROMPT_INSTRUCTIONS,
} from './messages.const';
import type { BotContext } from './utils/bot-context';

const NL = String.fromCharCode(10);

// O card entregue no privado, como o fan-out monta.
const CARD = [
  '🏠 Bet365',
  '🆚 Flamengo x Vasco',
  '⚽️ Futebol',
  '📌 Over 2.5',
  '🏷 1.90',
  '',
  '🎯 Recomendação de aposta: R$ 20,00',
  '💰 Lucro potencial: R$ 18,00',
].join(NL);

// O prompt que o "✏️ Editar" manda (force_reply), com o card no fim.
function prompt(tipId: number | '') {
  return `✏️ Editar aposta #55|t|${tipId}${NL}🏷 Odd atual: 1.90${NL}${EDIT_PROMPT_INSTRUCTIONS}${NL}${NL}${CARD}`;
}

function setup() {
  const tipsService = { saveDelivery: jest.fn().mockResolvedValue(undefined) };
  const usersService = {
    findByTelegramUserId: jest.fn().mockResolvedValue({ id: 10 }),
    getUserStake: jest.fn().mockResolvedValue(1000),
  };
  type Dependencies = ConstructorParameters<typeof BetTextService>;
  const service = new BetTextService(
    {} as Dependencies[0],
    {} as Dependencies[1],
    usersService as unknown as Dependencies[2],
    {} as Dependencies[3],
    {
      tipsCopyKeyboard: jest.fn(() => ({ inline_keyboard: [] })),
    } as unknown as Dependencies[4],
    {} as Dependencies[5],
    {} as Dependencies[6],
    {} as Dependencies[7],
    tipsService as unknown as Dependencies[8],
  );
  const raw = {
    from: { id: 20 },
    chat: { id: 30 },
    reply: jest.fn().mockResolvedValue(undefined),
    telegram: {
      editMessageText: jest.fn().mockResolvedValue(undefined),
      editMessageCaption: jest.fn().mockResolvedValue(undefined),
    },
  };
  const ctx = raw as unknown as typeof raw & BotContext;
  const editar = (text: string, tipId: number | '' = 9) => {
    const promptText = prompt(tipId);
    return service.handleEditReply(
      ctx,
      promptText,
      promptText.match(EDIT_PROMPT_HEADER_RE)!,
      text,
    );
  };
  return { editar, ctx, tipsService };
}

describe('"✏️ Editar" do card chega no resto do sistema', () => {
  it('grava a cópia editada: o /pendentes e o site passam a usar a odd nova', async () => {
    const { editar, ctx, tipsService } = setup();
    await editar('odd 2.50');

    const [, messageId, , editado] = ctx.telegram.editMessageText.mock
      .calls[0] as [number, number, undefined, string];
    expect(messageId).toBe(55);
    expect(editado).toContain('🏷 2.50');
    // A stake fica; o lucro acompanha a odd nova: 20 × 2,50 − 20.
    expect(editado).toContain('🎯 Recomendação de aposta: R$ 20,00');
    expect(editado).toContain('💰 Lucro potencial: R$ 30,00');

    expect(tipsService.saveDelivery).toHaveBeenCalledWith({
      tipId: 9,
      userId: 10,
      messageId: 55,
      hasMedia: false,
      text: editado,
      entities: null,
    });
    expect(ctx.reply).toHaveBeenCalledWith(
      '✅ Aposta atualizada!',
      expect.anything(),
    );
  });

  it('card sem tip (não veio do canal) não tem entrega pra gravar', async () => {
    const { editar, ctx, tipsService } = setup();
    await editar('odd 2.50', '');
    expect(tipsService.saveDelivery).not.toHaveBeenCalled();
    expect(ctx.reply).toHaveBeenCalledWith(
      '✅ Aposta atualizada!',
      expect.anything(),
    );
  });

  it('edição que o Telegram recusou não grava nada', async () => {
    const { editar, ctx, tipsService } = setup();
    ctx.telegram.editMessageText.mockRejectedValue(
      new Error('message to edit not found'),
    );
    jest.spyOn(console, 'error').mockImplementation(() => undefined);

    await editar('odd 2.50');
    expect(tipsService.saveDelivery).not.toHaveBeenCalled();
    expect(ctx.reply).toHaveBeenCalledWith(
      '❌ Erro ao atualizar. Tenta de novo.',
    );
  });

  it('mensagem editada mas cópia não gravada: avisa pra planilhar pela mensagem', async () => {
    const { editar, ctx, tipsService } = setup();
    tipsService.saveDelivery.mockRejectedValue(new Error('db fora'));
    jest.spyOn(console, 'error').mockImplementation(() => undefined);

    await editar('odd 2.50');
    const [aviso] = ctx.reply.mock.calls[0] as [string];
    expect(aviso).toContain('não consegui guardar a edição');
  });
});
