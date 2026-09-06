import OpenAI from 'openai';
import type { Context } from 'telegraf';
import type { Message } from 'telegraf/types';
import { BetAudioService, MAX_AUDIO_BYTES } from './bet-audio.service';
import { getOpenAIClient } from './openai-client';
import { BetTextService } from './bet-text.service';
import { buildBetPreview } from './utils/bet-preview.util';
import {
  parseBetLocal,
  extractStakeFromText,
} from './utils/tip-extractors.util';
import { TelegramService } from './telegram.service';

jest.mock('./openai-client');

const bet = {
  casa: 'Ginga',
  evento: 'Fluminense x Vasco',
  esporte: 'Futebol',
  mercado: 'Hulk marcar ou dar assistência',
  odd: 3,
  stake: 14.83,
};
const examples = [
  [
    'Casa Ginga, Fluminense contra Vasco, futebol, Hulk marcar ou dar assistência, odd três, stake quatorze reais e oitenta e três.',
    bet,
  ],
  [
    'Ginga, Real Betis e Real Madrid, mais de zero gols no primeiro tempo para o Real Madrid, Real Madrid mais de um gol, Betis mais de zero, odd dois e vinte, stake trinta e cinco.',
    {
      ...bet,
      evento: 'Real Betis x Real Madrid',
      mercado:
        'Real Madrid mais de 0 gols no primeiro tempo; Real Madrid mais de 1 gol; Betis mais de 0 gols',
      odd: 2.2,
      stake: 35,
    },
  ],
  [
    'Real Madrid e Barcelona, futebol, Real Madrid para vencer, stake cinquenta.',
    {
      ...bet,
      casa: null,
      evento: 'Real Madrid x Barcelona',
      mercado: 'Real Madrid para vencer',
      odd: null,
      stake: 50,
    },
  ],
] as const;

describe('BetAudioService (API mockada, não avalia qualidade acústica)', () => {
  const transcribe = jest.fn();
  const parse = jest.fn();
  const service = new BetAudioService();
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(getOpenAIClient).mockReturnValue({
      audio: { transcriptions: { create: transcribe } },
      responses: { create: parse },
    } as unknown as OpenAI);
  });

  it('envia OGG com nome/MIME corretos, contexto e idioma ao Transcribe', async () => {
    transcribe.mockResolvedValue({
      text: ' Casa Ginga. ',
      languages: [{ code: 'pt' }],
      usage: { type: 'duration', seconds: 8.4 },
    });
    expect(
      await service.transcribeBetAudio({
        audioBuffer: Buffer.from('ogg'),
        filename: 'voice.ogg',
        mimeType: 'audio/ogg',
      }),
    ).toBe('Casa Ginga.');
    const request = (
      transcribe.mock.calls as unknown[][]
    )[0][0] as OpenAI.Audio.TranscriptionCreateParams;
    expect(request.model).toBe('gpt-transcribe');
    expect(request.languages).toEqual(['pt']);
    expect(request.keywords).toContain('stake');
    const file = request.file as File;
    expect(file.name).toBe('voice.ogg');
    expect(file.type).toBe('audio/ogg');
    expect(await file.text()).toBe('ogg');
    expect(parse).not.toHaveBeenCalled();
  });

  it.each(examples)(
    'preserva resultado estruturado sem regex de números: %s',
    async (transcript, expected) => {
      parse.mockResolvedValue({
        output_text: JSON.stringify(expected),
        usage: {
          input_tokens: 120,
          output_tokens: 50,
          input_tokens_details: { cached_tokens: 0 },
        },
      });
      expect(await service.extractBetFromTranscript(transcript)).toEqual(
        expected,
      );
      const request = (
        parse.mock.calls as unknown[][]
      )[0][0] as OpenAI.Responses.ResponseCreateParamsNonStreaming;
      expect(request.reasoning?.effort).toBe('none');
      expect(request.prompt_cache_key).toBe('bet-audio-parser-v1');
      expect(request.store).toBe(false);
      expect(request.input).toEqual([
        expect.objectContaining({ role: 'developer' }),
        { role: 'user', content: transcript },
      ]);
      expect(request.text?.format).toMatchObject({
        type: 'json_schema',
        strict: true,
        schema: { additionalProperties: false },
      });
      expect(transcribe).not.toHaveBeenCalled();
    },
  );

  it.each([{ text: '' }, { text: '   ' }, { text: 'ruído', languages: [] }])(
    'rejeita transcrição vazia/sem fala: %j',
    async (response) => {
      transcribe.mockResolvedValue(response);
      await expect(
        service.transcribeBetAudio({
          audioBuffer: Buffer.from('ogg'),
          filename: 'voice.ogg',
        }),
      ).rejects.toThrow('AUDIO_SEM_FALA');
    },
  );

  it('rejeita buffer vazio, arquivo grande e formato não suportado antes da API', async () => {
    for (const [buffer, filename, error] of [
      [Buffer.alloc(0), 'v.ogg', 'AUDIO_VAZIO'],
      [Buffer.alloc(MAX_AUDIO_BYTES + 1), 'v.ogg', 'AUDIO_MUITO_GRANDE'],
      [Buffer.from('x'), 'v.exe', 'AUDIO_FORMATO_INVALIDO'],
    ] as const) {
      await expect(
        service.transcribeBetAudio({ audioBuffer: buffer, filename }),
      ).rejects.toThrow(error);
    }
    expect(transcribe).not.toHaveBeenCalled();
    await expect(service.extractBetFromTranscript(' ')).rejects.toThrow(
      'TRANSCRICAO_VAZIA',
    );
    expect(parse).not.toHaveBeenCalled();
  });

  it('não aceita JSON inválido nem inventa saída após falha da API', async () => {
    parse.mockResolvedValue({ output_text: 'não é JSON' });
    await expect(service.extractBetFromTranscript('fala')).rejects.toThrow(
      'IA_JSON_INVALIDO',
    );
    transcribe.mockRejectedValue(new Error('API indisponível'));
    await expect(
      service.transcribeBetAudio({
        audioBuffer: Buffer.from('ogg'),
        filename: 'v.ogg',
      }),
    ).rejects.toThrow('API indisponível');
  });
});

function setup() {
  const grok = { resolveHouseId: jest.fn().mockResolvedValue(7) };
  const save = { createBet: jest.fn() };
  const audio = {
    transcribeBetAudio: jest.fn().mockResolvedValue(examples[0][0]),
    extractBetFromTranscript: jest.fn().mockResolvedValue(bet),
  };
  type Deps = ConstructorParameters<typeof BetTextService>;
  const service = new BetTextService(
    grok as unknown as Deps[0],
    save as unknown as Deps[1],
    {} as Deps[2],
    {} as Deps[3],
    {} as Deps[4],
    {} as Deps[5],
    audio as unknown as Deps[6],
  );
  const context = {
    chat: { id: 1 },
    from: { id: 2 },
    reply: jest.fn().mockResolvedValue({ message_id: 20 }),
    telegram: {
      getFileLink: jest
        .fn()
        .mockResolvedValue(new URL('https://api.telegram.org/file/voice.ogg')),
      editMessageText: jest.fn().mockResolvedValue({}),
    },
  };
  const msg = {
    message_id: 10,
    date: 1757000000,
    voice: {
      file_id: 'voice-id',
      duration: 8,
      mime_type: 'audio/ogg',
      file_size: 3,
    },
  } as Message.VoiceMessage;
  return {
    service,
    grok,
    save,
    audio,
    context,
    ctx: context as unknown as Context,
    msg,
  };
}

describe('Entrada de áudio no preview comum', () => {
  const originalFetch = global.fetch;
  beforeEach(() => {
    global.fetch = jest.fn().mockResolvedValue(new Response('ogg'));
  });
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('voice usa mesmo preview/horário e nunca registra antes do clique', async () => {
    const { service, ctx, context, msg, audio, grok, save } = setup();
    await service.handleBetAudio(ctx, msg);
    expect(context.telegram.getFileLink).toHaveBeenCalledWith('voice-id');
    expect(audio.transcribeBetAudio).toHaveBeenCalledWith(
      expect.objectContaining({
        filename: 'voice.ogg',
        mimeType: 'audio/ogg',
        audioBuffer: Buffer.from('ogg'),
      }),
    );
    expect(grok.resolveHouseId).toHaveBeenCalledWith('🏠 Ginga');
    const [, , , text, options] = context.telegram.editMessageText.mock
      .calls[0] as [
      number,
      number,
      undefined,
      string,
      { reply_markup: unknown },
    ];
    const common = buildBetPreview(bet, 'Ginga', msg.date);
    expect(text).toBe(common.text);
    expect(options.reply_markup).toEqual(common.reply_markup);
    expect(JSON.stringify(options)).toContain(`planilhar_ts:${msg.date}`);
    expect(parseBetLocal(text)?.market).toBe(bet.mercado);
    expect(extractStakeFromText(text)).toBe(14.83);
    expect(save.createBet).not.toHaveBeenCalled();
  });

  it('aceita arquivo audio com nome e MIME, sem exigir legenda', async () => {
    const { service, ctx, msg, audio } = setup();
    const file = {
      message_id: msg.message_id,
      date: msg.date,
      audio: {
        file_id: 'mp3-id',
        file_name: 'aposta.mp3',
        mime_type: 'audio/mpeg',
        duration: 12,
      },
    } as Message.AudioMessage;
    await service.handleBetAudio(ctx, file);
    expect(audio.transcribeBetAudio).toHaveBeenCalledWith(
      expect.objectContaining({
        filename: 'aposta.mp3',
        mimeType: 'audio/mpeg',
      }),
    );
  });

  it.each([null, 'Casa inexistente'])(
    'não habilita Planilhar sem casa válida e odd: %s',
    async (house) => {
      const { service, ctx, context, msg, audio, grok, save } = setup();
      audio.extractBetFromTranscript.mockResolvedValue({
        ...bet,
        casa: house,
        odd: null,
      });
      grok.resolveHouseId.mockResolvedValue(null);
      await service.handleBetAudio(ctx, msg);
      const call = context.telegram.editMessageText.mock.calls[0] as unknown[];
      expect(call[3]).toEqual(expect.stringContaining('• Casa'));
      expect(call[3]).toEqual(expect.stringContaining('• Odd'));
      expect(call[4]).toEqual({ reply_markup: undefined });
      expect(save.createBet).not.toHaveBeenCalled();
    },
  );

  it.each(['download', 'transcribe', 'parse', 'size'])(
    'falha amigável sem gravar aposta: %s',
    async (failure) => {
      const { service, ctx, context, msg, audio, save } = setup();
      if (failure === 'download')
        global.fetch = jest
          .fn()
          .mockResolvedValue(new Response('', { status: 500 }));
      if (failure === 'transcribe')
        audio.transcribeBetAudio.mockRejectedValue(new Error('privado'));
      if (failure === 'parse')
        audio.extractBetFromTranscript.mockRejectedValue(new Error('privado'));
      if (failure === 'size') msg.voice.file_size = MAX_AUDIO_BYTES + 1;
      await service.handleBetAudio(ctx, msg);
      const output = JSON.stringify({
        replies: context.reply.mock.calls as unknown,
        edits: context.telegram.editMessageText.mock.calls as unknown,
      });
      expect(output).not.toContain('privado');
      expect(output).not.toContain('planilhar_ts');
      expect(save.createBet).not.toHaveBeenCalled();
      if (failure === 'size')
        expect(context.telegram.getFileLink).not.toHaveBeenCalled();
    },
  );

  it('limita o download pelos bytes reais sem depender do tamanho informado', async () => {
    const { service, ctx, context, msg, audio, save } = setup();
    delete msg.voice.file_size;
    global.fetch = jest
      .fn()
      .mockResolvedValue(new Response(new Uint8Array(MAX_AUDIO_BYTES + 1)));
    await service.handleBetAudio(ctx, msg);
    expect(audio.transcribeBetAudio).not.toHaveBeenCalled();
    expect(save.createBet).not.toHaveBeenCalled();
    expect(
      JSON.stringify(context.telegram.editMessageText.mock.calls),
    ).toContain('20 MB');
  });

  it('handler do Telegram encaminha voice/audio sem passar pelo parser textual', async () => {
    const commands = jest.fn();
    const handlers = new Map<string, (ctx: Context) => Promise<void>>();
    const bot = {
      command: commands,
      on: (event: string, handler: (ctx: Context) => Promise<void>) =>
        handlers.set(event, handler),
    };
    const text = { handleBetAudio: jest.fn(), processBetText: jest.fn() };
    type Deps = ConstructorParameters<typeof TelegramService>;
    new TelegramService(
      bot as unknown as Deps[0],
      {} as Deps[1],
      text as unknown as Deps[2],
      { isTipsGroup: () => false } as unknown as Deps[3],
      {} as Deps[4],
    ).onModuleInit();
    for (const field of ['voice', 'audio']) {
      const ctx = {
        chat: { id: 1 },
        message: { [field]: { file_id: 'x' } },
      } as unknown as Context;
      await handlers.get('message')!(ctx);
      expect(text.handleBetAudio).toHaveBeenLastCalledWith(ctx, ctx.message);
    }
    expect(text.processBetText).not.toHaveBeenCalled();
  });
});
