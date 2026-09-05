import { Injectable } from '@nestjs/common';
import OpenAI from 'openai';
import * as dotenv from 'dotenv';

dotenv.config();

const MODEL = 'gpt-5.6-luna';

// Único lugar onde as regras de leitura do bilhete vivem. Mexer aqui muda o
// comportamento do reconhecimento inteiro — não espalhar regra em outro
// arquivo.
export const BET_IMAGE_PROMPT = `Analise somente a aposta efetivamente realizada no print.
Extraia evento, esporte, mercado, odd total e stake.

Regras:
- Nao invente dados; retorne null se nao identificar um campo com seguranca.
- Ignore outros jogos, mercados disponiveis, saldo, retorno, cashout, limite, IDs, datas e horarios.
- O esporte pode ser inferido pelo contexto.
- Mercado deve conter somente as condicoes esportivas para a aposta vencer, preservando jogadores, linhas, periodos e tipo de estatistica.
- Junte todas as selecoes relevantes em apostas combinadas/criadas.
- Exclua do mercado interface, status e promocoes, como "Criar Aposta", "Super Odds", "Boost", "BetoBoost", "Simples", "Multiplas", "Perdida" e "Ganha".
- Odd e a TOTAL/final da aposta. Ignore odds antigas/riscadas, individuais e de outros eventos.
- Stake e somente o valor efetivamente apostado, nunca saldo, retorno, cashout ou limite.`;

const BET_IMAGE_SCHEMA = {
  type: 'object',
  properties: {
    evento: { type: ['string', 'null'] },
    esporte: { type: ['string', 'null'] },
    mercado: { type: ['string', 'null'] },
    odd: { type: ['number', 'null'] },
    stake: { type: ['number', 'null'] },
  },
  required: ['evento', 'esporte', 'mercado', 'odd', 'stake'],
  additionalProperties: false,
} as const;

export interface ExtractedBetImage {
  evento: string | null;
  esporte: string | null;
  mercado: string | null;
  odd: number | null;
  stake: number | null;
}

// Responsabilidade única: IMAGEM -> DADOS. Não conhece Telegram, banco nem
// botão. Quem chama é que combina isso com casa/horário.
@Injectable()
export class BetImageService {
  private client: OpenAI | null = null;

  // Lazy: sem a chave o resto da API continua subindo normalmente (mesmo
  // espírito do webhook do Telegram, que também não derruba o app).
  private getClient(): OpenAI {
    if (!this.client) {
      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) throw new Error('OPENAI_API_KEY_AUSENTE');
      this.client = new OpenAI({ apiKey });
    }
    return this.client;
  }

  async extractBetFromImage({
    imageBuffer,
    mimeType,
    deep = false,
  }: {
    imageBuffer: Buffer;
    mimeType: string;
    deep?: boolean;
  }): Promise<ExtractedBetImage> {
    const dataUrl = `data:${mimeType};base64,${imageBuffer.toString('base64')}`;
    const startedAt = Date.now();

    const response = await this.getClient().responses.create({
      model: MODEL,
      reasoning: { effort: deep ? 'low' : 'none' },
      prompt_cache_key: 'bet-image-extractor-v1',
      prompt_cache_options: { mode: 'implicit', ttl: '30m' },
      input: [
        {
          role: 'user',
          content: [
            { type: 'input_text', text: BET_IMAGE_PROMPT },
            {
              type: 'input_image',
              image_url: dataUrl,
              detail: deep ? 'high' : 'original',
            },
          ],
        },
      ],
      text: {
        format: {
          type: 'json_schema',
          name: 'bet_image_extraction',
          strict: true,
          schema: BET_IMAGE_SCHEMA as unknown as Record<string, unknown>,
        },
      },
    });

    const usage = response.usage;
    console.log(
      `[BET_IMAGE_AI] model=${MODEL} mode=${deep ? 'deep' : 'standard'} input=${usage?.input_tokens ?? '?'} ` +
        `cached=${usage?.input_tokens_details?.cached_tokens ?? 0} ` +
        `cache_write=${usage?.input_tokens_details?.cache_write_tokens ?? 0} ` +
        `output=${usage?.output_tokens ?? '?'} total=${usage?.total_tokens ?? '?'} ` +
        `reasoning=${usage?.output_tokens_details?.reasoning_tokens ?? '?'} ` +
        `duration=${((Date.now() - startedAt) / 1000).toFixed(2)}s`,
    );

    const raw = response.output_text?.trim();
    if (!raw) throw new Error('IA_SEM_RESPOSTA');

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new Error('IA_JSON_INVALIDO');
    }
    if (!parsed || typeof parsed !== 'object')
      throw new Error('IA_JSON_INVALIDO');

    return normalizeExtraction(parsed as Record<string, unknown>);
  }
}

// Structured Outputs garante o formato, mas o schema aceita null em tudo e
// nada impede a IA de devolver "3,00" num campo de número — normaliza antes
// de qualquer um confiar nos tipos.
export function normalizeExtraction(
  obj: Record<string, unknown>,
): ExtractedBetImage {
  const str = (v: unknown): string | null => {
    const s = typeof v === 'string' ? v.trim() : '';
    return s ? s : null;
  };
  const num = (v: unknown): number | null => {
    if (typeof v === 'number') return Number.isFinite(v) ? v : null;
    if (typeof v === 'string') {
      const n = Number(v.replace(/[^\d.,-]/g, '').replace(',', '.'));
      return Number.isFinite(n) ? n : null;
    }
    return null;
  };

  return {
    evento: str(obj.evento),
    esporte: str(obj.esporte),
    mercado: str(obj.mercado),
    odd: num(obj.odd),
    stake: num(obj.stake),
  };
}
