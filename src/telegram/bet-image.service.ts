import { Injectable } from '@nestjs/common';
import OpenAI from 'openai';
import * as dotenv from 'dotenv';

dotenv.config();

const MODEL = 'gpt-5.6-luna';

// Único lugar onde as regras de leitura do bilhete vivem. Mexer aqui muda o
// comportamento do reconhecimento inteiro — não espalhar regra em outro
// arquivo.
export const BET_IMAGE_PROMPT = `Você é um extrator de dados de bilhetes de apostas esportivas.

Analise especificamente a aposta EFETIVAMENTE REALIZADA no print.

Extraia: evento, esporte, mercado, odd total e stake.

Não invente informações. Se evento, mercado, odd ou stake não puderem ser
identificados com segurança, retorne null no respectivo campo.

ESPORTE
Pode ser inferido pelo contexto quando houver evidências fortes. Não é
necessário que a palavra "Futebol"/"Basquete" esteja escrita no print.
- "Fluminense x Vasco" + "Hulk" + "marcar ou dar assistência" => Futebol
- "Boston Celtics x Miami Heat" + pontos/rebotes => Basquete
- "Carlos Alcaraz x Jannik Sinner" + sets/games => Tênis
Só retorne null quando realmente não for possível inferir com confiança.

EVENTO
Identifique somente o evento da aposta efetivamente realizada. Ignore outros
jogos visíveis ao fundo, sugestões da casa, eventos disponíveis para apostar
e banners.

MERCADO
Não existe campo "seleção" separado: o campo mercado deve conter tudo que
identifica exatamente a seleção apostada. Exemplos:
- "Juárez - 1x2"
- "Sim - Ambas equipes marcam"
- "Mais de 2,5 gols - Total de gols"
- "Carlos Vinicius: Mais de 0,5 chutes no gol"
- "Carlos Vinicius: Mais de 0,5 chutes no gol e Jonathan Calleri: Mais de 0,5 chutes no gol"
- "SC Freiburg e Sim - 1x2 e ambas equipes marcam"
- "Hulk tocar na bola + marcar ou dar assistência"
Preserve informações importantes da seleção, mas NÃO inclua etiquetas
promocionais: Super odds, BetoBoost, Boost, Price Boost, Odds aumentadas,
Enhanced Odds, Turbo, Promoção, Oferta, bônus.
Certo: "Hulk tocar na bola + marcar ou dar assistência"
Errado: "Hulk tocar na bola + marcar ou dar assistência - Super odds"

ODD
Somente a odd TOTAL da aposta realizada. Ignore odds de outras partidas,
odds disponíveis para apostar, odds individuais quando existir múltipla com
odd total, e a odd antiga riscada quando um boost mostra uma nova odd
(1.78 riscada -> 3.00 atual => 3.00).

STAKE
Somente o valor efetivamente apostado. "Valor: R$ 14,83" => 14.83.
"Aposta R$100,00" => 100. Não confundir com saldo, possível retorno, ganho
potencial, cashout, limite, bônus, depósito, saque ou valor de outra aposta.

RETORNO, HORÁRIO e CASA: ignore completamente, não extraia.`;

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
  }: {
    imageBuffer: Buffer;
    mimeType: string;
  }): Promise<ExtractedBetImage> {
    const dataUrl = `data:${mimeType};base64,${imageBuffer.toString('base64')}`;
    const startedAt = Date.now();

    const response = await this.getClient().responses.create({
      model: MODEL,
      reasoning: { effort: 'low' },
      input: [
        {
          role: 'user',
          content: [
            { type: 'input_text', text: BET_IMAGE_PROMPT },
            { type: 'input_image', image_url: dataUrl, detail: 'high' },
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
      `[BET_IMAGE_AI] model=${MODEL} input=${usage?.input_tokens ?? '?'} ` +
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
