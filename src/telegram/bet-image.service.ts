import {
  normalizeBetData,
  BET_EXTRACTION_RULES,
} from '../bet/bet-normalization';
import { Injectable } from '@nestjs/common';
import { getOpenAIClient } from './openai-client';
import * as dotenv from 'dotenv';

dotenv.config();

const MODEL = 'gpt-5.6-luna';

// Único lugar onde as regras de leitura do bilhete vivem. Mexer aqui muda o
// comportamento do reconhecimento inteiro — não espalhar regra em outro
// arquivo.
export const BET_IMAGE_PROMPT = `Analise somente a aposta efetivamente realizada no print.
Extraia evento, esporte, mercado, odd total e stake.

Regras:
${BET_EXTRACTION_RULES}
- Nao invente dados; retorne null se nao identificar um campo com seguranca.
- Ignore jogos fora do bilhete, mercados disponiveis, saldo, retorno, cashout, limite, IDs, datas e horarios. Numa multipla, todas as selecoes do bilhete fazem parte da aposta.
- O esporte pode ser inferido pelo contexto.
- No evento, remova sufixos geograficos redundantes dos times quando a identidade estiver clara: "Sao Paulo SP vs Palmeiras" deve ser "Sao Paulo vs Palmeiras". Preserve acentos do nome e siglas que sejam parte do nome ou necessarias para distinguir equipes.
- Mercado deve conter somente as condicoes esportivas para a aposta vencer, preservando jogadores, linhas, periodos e tipo de estatistica.
- Em selecoes de jogador, separe o nome e a condicao do mercado com " - ": "Joaquin Piquerez - jogador a ser advertido". Nao deixe nome e mercado concatenados sem esse separador.
- Junte todas as selecoes relevantes em apostas combinadas/criadas no campo mercado, usando exclusivamente " / " (barra com espacos) entre selecoes distintas. Nao use "e", ";" ou "+" como separador de selecoes.
- Exemplo de mercado combinado: "Pedro - chute ao gol / mais de 2.5 gols". Preserve conectivos que fazem parte de uma unica selecao ou nome; apenas a separacao entre selecoes deve usar " / ".
- Exclua do mercado interface, status e promocoes, como "Criar Aposta", "Super Odds", "Boost", "BetoBoost", "Simples", "Multiplas", "Perdida" e "Ganha".
- Odd e a TOTAL/final da aposta. Ignore odds antigas/riscadas, individuais e de outros eventos.
- Stake e somente o valor efetivamente apostado, nunca saldo, retorno, cashout ou limite.`;

export const BET_IMAGE_SCHEMA = {
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

    const response = await getOpenAIClient().responses.create({
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

    return normalizeExtraction(parseExtractionObject(response.output_text));
  }
}

export function parseExtractionObject(text: string): Record<string, unknown> {
  const raw = text?.trim();
  if (!raw) throw new Error('IA_SEM_RESPOSTA');

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('IA_JSON_INVALIDO');
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
    throw new Error('IA_JSON_INVALIDO');

  return parsed as Record<string, unknown>;
}

// Structured Outputs garante o formato, mas o schema aceita null em tudo e
// nada impede a IA de devolver "3,00" num campo de número — normaliza antes
// de qualquer um confiar nos tipos.
export function normalizeExtraction(
  obj: Record<string, unknown>,
): ExtractedBetImage {
  const data = normalizeBetData({
    game: obj.evento,
    market: obj.mercado,
    sport: obj.esporte,
    odd: obj.odd,
    stake: obj.stake,
  });
  return {
    evento: data.game,
    mercado: data.market,
    esporte: data.sport,
    odd: data.odd,
    stake: data.stake,
  };
}
