import { normalizeExtraction } from './bet-image.service';
import { BetTextService } from './bet-text.service';
import {
  extractStakeFromText,
  parseBetLocal,
} from './utils/tip-extractors.util';

describe('normalizeExtraction', () => {
  it('mantém os campos já tipados corretamente', () => {
    expect(
      normalizeExtraction({
        evento: 'Fluminense x Vasco',
        esporte: 'Futebol',
        mercado: 'Hulk tocar na bola + marcar ou dar assistência',
        odd: 3.0,
        stake: 14.83,
      }),
    ).toEqual({
      evento: 'Fluminense x Vasco',
      esporte: 'Futebol',
      mercado: 'Hulk tocar na bola + marcar ou dar assistência',
      odd: 3.0,
      stake: 14.83,
    });
  });

  it('converte número em string BR e trata vazio/null como null', () => {
    const r = normalizeExtraction({
      evento: '  ',
      esporte: null,
      mercado: 'Juárez - 1x2',
      odd: '2,69',
      stake: 'R$ 100,00',
    });
    expect(r.evento).toBeNull();
    expect(r.esporte).toBeNull();
    expect(r.odd).toBe(2.69);
    expect(r.stake).toBe(100);
  });
});

describe('extractStakeFromText', () => {
  it('lê a stake absoluta do card de print', () => {
    expect(extractStakeFromText('💰 Stake: R$ 14,83')).toBe(14.83);
    expect(extractStakeFromText('💰 Stake: R$ 100,00')).toBe(100);
  });

  it('não confunde com o lucro potencial do card de tip', () => {
    expect(extractStakeFromText('💰 Lucro potencial: R$ 44,49')).toBeNull();
  });
});

// Fábrica de BetTextService com todas as dependências mockadas — nenhum
// teste aqui toca OpenAI, Groq, Telegram ou banco.
function buildService(overrides: Record<string, any> = {}) {
  const deps = {
    grokService: { resolveHouseId: jest.fn().mockResolvedValue(7) },
    betService: { createBet: jest.fn() },
    usersService: {},
    houseService: {},
    tipFanoutService: {},
    betImageService: { extractBetFromImage: jest.fn() },
    ...overrides,
  };
  const service = new BetTextService(
    deps.grokService as any,
    deps.betService as any,
    deps.usersService as any,
    deps.houseService as any,
    deps.tipFanoutService as any,
    deps.betImageService as any,
  );
  return { service, deps };
}

function buildCtx() {
  return {
    chat: { id: 1 },
    from: { id: 2 },
    reply: jest.fn().mockResolvedValue(undefined),
    telegram: {
      getFileLink: jest
        .fn()
        .mockResolvedValue(new URL('https://api.telegram.org/file/photo.jpg')),
    },
  };
}

const photoMsg = {
  message_id: 10,
  date: 1_757_000_000,
  caption: 'Ginga',
  photo: [{ file_id: 'small' }, { file_id: 'big' }],
};

describe('BetTextService.handleBetPhoto', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: async () => new ArrayBuffer(4),
    }) as any;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('recusa foto sem legenda antes de chamar a IA', async () => {
    const { service, deps } = buildService();
    const ctx = buildCtx();

    await service.handleBetPhoto(ctx, { ...photoMsg, caption: '' });

    expect(deps.betImageService.extractBetFromImage).not.toHaveBeenCalled();
    expect(ctx.reply.mock.calls[0][0]).toContain('nome da casa na legenda');
  });

  it('recusa casa desconhecida antes de chamar a IA', async () => {
    const { service, deps } = buildService({
      grokService: { resolveHouseId: jest.fn().mockResolvedValue(null) },
    });
    const ctx = buildCtx();

    await service.handleBetPhoto(ctx, photoMsg);

    expect(deps.betImageService.extractBetFromImage).not.toHaveBeenCalled();
    expect(ctx.reply.mock.calls[0][0]).toContain('Erro ao ler a casa');
  });

  it('lista os campos críticos faltando em vez de mostrar o botão', async () => {
    const { service } = buildService({
      betImageService: {
        extractBetFromImage: jest.fn().mockResolvedValue({
          evento: 'Fluminense x Vasco',
          esporte: 'Futebol',
          mercado: 'Hulk marcar',
          odd: null,
          stake: null,
        }),
      },
    });
    const ctx = buildCtx();

    await service.handleBetPhoto(ctx, photoMsg);

    const [text, extra] = ctx.reply.mock.calls[0];
    expect(text).toContain('• Odd');
    expect(text).toContain('• Stake');
    expect(extra.reply_markup).toBeUndefined();
  });

  it('usa a maior resolução e gera um card que o fluxo de Planilhar relê', async () => {
    const { service, deps } = buildService({
      betImageService: {
        extractBetFromImage: jest.fn().mockResolvedValue({
          evento: 'Fluminense x Vasco',
          esporte: 'Futebol',
          mercado: 'Hulk tocar na bola + marcar ou dar assistência',
          odd: 3.0,
          stake: 14.83,
        }),
      },
    });
    const ctx = buildCtx();

    await service.handleBetPhoto(ctx, photoMsg);

    expect(ctx.telegram.getFileLink).toHaveBeenCalledWith('big');

    const [text, extra] = ctx.reply.mock.calls[0];
    expect(text).toContain('✅ Aposta identificada!');
    expect(extra.reply_markup.inline_keyboard[0][0].callback_data).toBe(
      `planilhar_ts:${photoMsg.date}`,
    );

    // O contrato de verdade: o card tem que ser reparseável pelo mesmo
    // parser textual que o botão Planilhar usa.
    expect(parseBetLocal(text)).toEqual({
      game: 'Fluminense x Vasco',
      sport: 'Futebol',
      market: 'Hulk tocar na bola + marcar ou dar assistência',
      odd: 3,
    });
    expect(extractStakeFromText(text)).toBe(14.83);
    expect(deps.grokService.resolveHouseId).toHaveBeenCalledWith('🏠 Ginga');
  });

  it('avisa sem stack trace quando a OpenAI falha', async () => {
    const { service } = buildService({
      betImageService: {
        extractBetFromImage: jest.fn().mockRejectedValue(new Error('boom')),
      },
    });
    const ctx = buildCtx();
    jest.spyOn(console, 'error').mockImplementation(() => {});

    await service.handleBetPhoto(ctx, photoMsg);

    expect(ctx.reply.mock.calls[0][0]).toContain('Não consegui ler esse print');
  });
});
