import { PendentesService } from './pendentes.service';
import { TelegramCallbackService } from './telegram-callback.service';

const TIP_TEXT = '🏠 Betfair\n🆚 Real Madrid x Barcelona\n🏷 Odd: 2.10';

function tip(id: number, overrides: Record<string, unknown> = {}) {
  return {
    id,
    text: TIP_TEXT,
    percent: 3,
    isAviso: false,
    createdAt: new Date('2026-09-07T12:00:00Z'),
    betId: null,
    dismissalId: null,
    ...overrides,
  };
}

function setup(rows: ReturnType<typeof tip>[]) {
  const tipsService = {
    getSummaryForUser: jest.fn().mockResolvedValue(rows),
    findById: jest.fn().mockImplementation((id: number) => {
      const found = rows.find((r) => r.id === id);
      return Promise.resolve(found ? { id, text: found.text } : undefined);
    }),
    findDelivery: jest.fn().mockResolvedValue({ messageId: 99 }),
    dismissTip: jest.fn().mockResolvedValue(true),
    undismissTip: jest.fn().mockResolvedValue(undefined),
  };
  const betService = {
    findBetByTip: jest.fn().mockResolvedValue(undefined),
    deleteBetByTip: jest.fn().mockResolvedValue({ id: 7 }),
  };
  const betTextService = { processBetText: jest.fn().mockResolvedValue(undefined) };
  const pendentes = new PendentesService(tipsService as never);
  type Dependencies = ConstructorParameters<typeof TelegramCallbackService>;
  const callback = new TelegramCallbackService(
    {
      findByTelegramUserId: jest.fn().mockResolvedValue({ id: 10 }),
    } as unknown as Dependencies[0],
    tipsService as unknown as Dependencies[1],
    betTextService as unknown as Dependencies[2],
    { markDeliveredMessage: jest.fn() } as unknown as Dependencies[3],
    pendentes,
    betService as unknown as Dependencies[5],
  );
  const ctx = {
    from: { id: 20 },
    callbackQuery: { message: { text: 'lista', message_id: 3, chat: { id: 30 } } },
    answerCbQuery: jest.fn().mockResolvedValue(undefined),
    editMessageText: jest.fn().mockResolvedValue(undefined),
  };
  return { pendentes, callback, ctx, tipsService, betService, betTextService };
}

const user = { id: 10, minPercentFilter: null };
const click = (data: string, ctx: ReturnType<typeof setup>['ctx']) => ({
  ...ctx,
  callbackQuery: { ...ctx.callbackQuery, data },
});

describe('lista do /pendentes', () => {
  it('marca cada botão com o número da pendência a que pertence', async () => {
    const { pendentes } = setup([tip(1), tip(2)]);
    const { keyboard } = await pendentes.buildMessage(user, 0);
    const labels = keyboard.inline_keyboard.map((row: any[]) =>
      row.map((b) => b.text),
    );
    expect(labels[0]).toEqual(['1️⃣ ✅ Planilhar', '1️⃣ ❌ Caiu', '1️⃣ ✏️ Editar']);
    expect(labels[1]).toEqual(['2️⃣ ✅ Planilhar', '2️⃣ ❌ Caiu', '2️⃣ ✏️ Editar']);
  });

  it('numera seguindo a página, não a posição na tela', async () => {
    const { pendentes } = setup([tip(1), tip(2), tip(3), tip(4)]);
    const { keyboard } = await pendentes.buildMessage(user, 1);
    expect(keyboard.inline_keyboard[0][0].text).toBe('3️⃣ ✅ Planilhar');
    expect(keyboard.inline_keyboard[1][0].text).toBe('4️⃣ ✅ Planilhar');
  });

  it('só mostra Desfazer quando a ação acabou de acontecer', async () => {
    const { pendentes } = setup([tip(1)]);
    const semUndo = await pendentes.buildMessage(user, 0);
    expect(JSON.stringify(semUndo.keyboard)).not.toContain('lista_desfazer');

    const comUndo = await pendentes.buildMessage(user, 0, {
      tipId: 5,
      kind: 'planilhar',
      label: 'Real Madrid x Barcelona',
    });
    expect(comUndo.keyboard.inline_keyboard[0][0]).toEqual({
      text: '↩️ Desfazer Real Madrid x Barcelona',
      callback_data: 'lista_desfazer:5:0:0',
    });
  });

  it('oferece Desfazer mesmo quando a lista esvaziou', async () => {
    const { pendentes } = setup([]);
    const { text, keyboard } = await pendentes.buildMessage(user, 0, {
      tipId: 5,
      kind: 'caiu',
      label: 'Jogo',
    });
    expect(text).toBe('🎉 Nada pendente!');
    expect(keyboard.inline_keyboard[0][0].callback_data).toBe('lista_desfazer:5:0:1');
  });
});

describe('callbacks do /pendentes', () => {
  it('planilha uma vez e recusa o clique repetido enquanto processa', async () => {
    const { callback, ctx, betTextService } = setup([tip(1)]);
    let release!: () => void;
    betTextService.processBetText.mockImplementation(
      () => new Promise<void>((resolve) => { release = resolve; }),
    );

    const first = callback.handle(click('lista_planilhar:1:0', ctx));
    await Promise.resolve();
    await callback.handle(click('lista_planilhar:1:0', ctx));
    release();
    await first;

    expect(betTextService.processBetText).toHaveBeenCalledTimes(1);
    expect(ctx.answerCbQuery).toHaveBeenCalledWith('⏳ Já estou processando esse item.');
  });

  it('não replanilha uma tip que já virou aposta', async () => {
    const { callback, ctx, betService, betTextService } = setup([tip(1)]);
    betService.findBetByTip.mockResolvedValue({ id: 7, game: 'Real Madrid x Barcelona' });

    await callback.handle(click('lista_planilhar:1:0', ctx));

    expect(betTextService.processBetText).not.toHaveBeenCalled();
    expect(ctx.answerCbQuery).toHaveBeenCalledWith(
      '✅ Real Madrid x Barcelona já está planilhada.',
    );
  });

  it('oferece Desfazer depois de planilhar e apaga a aposta ao desfazer', async () => {
    const { callback, ctx, betService } = setup([tip(1)]);

    await callback.handle(click('lista_planilhar:1:0', ctx));
    expect(ctx.answerCbQuery).toHaveBeenCalledWith('✅ Real Madrid x Barcelona planilhada!');
    const [, options] = ctx.editMessageText.mock.calls.at(-1) as [string, any];
    expect(JSON.stringify(options.reply_markup)).toContain('lista_desfazer:1:0:0');

    await callback.handle(click('lista_desfazer:1:0:0', ctx));
    expect(betService.deleteBetByTip).toHaveBeenCalledWith(1, 10);
  });

  it('desfazer de "caiu" devolve a tip em vez de mexer em aposta', async () => {
    const { callback, ctx, tipsService, betService } = setup([tip(1)]);

    await callback.handle(click('lista_caiu:1:0', ctx));
    expect(tipsService.dismissTip).toHaveBeenCalledWith(1, 10);

    await callback.handle(click('lista_desfazer:1:0:1', ctx));
    expect(tipsService.undismissTip).toHaveBeenCalledWith(1, 10);
    expect(betService.deleteBetByTip).not.toHaveBeenCalled();
  });

  it('recusa ID de pendência inválido antes de tocar no banco', async () => {
    const { callback, ctx, tipsService } = setup([tip(1)]);
    await callback.handle(click('lista_planilhar:0:0', ctx));
    expect(ctx.answerCbQuery).toHaveBeenCalledWith('❌ Referência inválida.');
    expect(tipsService.findById).not.toHaveBeenCalled();
  });

  it('recusa usuário não vinculado', async () => {
    const { callback, ctx, tipsService } = setup([tip(1)]);
    type Dependencies = ConstructorParameters<typeof TelegramCallbackService>;
    (callback as unknown as { usersService: Dependencies[0] }).usersService = {
      findByTelegramUserId: jest.fn().mockResolvedValue(undefined),
    } as unknown as Dependencies[0];

    await callback.handle(click('lista_planilhar:1:0', ctx));
    expect(ctx.answerCbQuery).toHaveBeenCalledWith('❌ Conta não vinculada.');
    expect(tipsService.findById).not.toHaveBeenCalled();
  });

  it('mantém a página ao recarregar a lista depois de resolver um item', async () => {
    const { callback, ctx } = setup([tip(1), tip(2), tip(3), tip(4)]);
    await callback.handle(click('lista_caiu:3:1', ctx));
    const [listText] = ctx.editMessageText.mock.calls.at(-1) as [string];
    expect(listText).toContain('3️⃣');
  });
});
