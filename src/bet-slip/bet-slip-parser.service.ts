import {
  normalizeBetData,
  normalizeBetNumber,
  BET_EXTRACTION_RULES,
} from '../bet/bet-normalization';
import { Injectable } from '@nestjs/common';
import { getOpenAIClient } from '../telegram/openai-client';
import * as dotenv from 'dotenv';

dotenv.config();

const MODEL = 'gpt-5.6-luna';

// A function do Vercel morre em 60s. Sem teto proprio o SDK espera 10 min, a
// plataforma corta a conexao no meio e o app fica girando sem nunca receber
// resposta nem erro — por isso o timeout aqui e menor que o da function.
const AI_TIMEOUT_MS = 45_000;

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
- Odd e a TOTAL/final da aposta — quando houver boost/turbinada, e a odd aumentada, a que vale.
- Quando o bilhete NAO mostra a odd total (comum em multipla grande, que so exibe aposta e retorno), retorne odd null e preencha oddsSelecoes com a odd de CADA selecao do bilhete, na ordem em que aparecem. Quando a odd total aparece, oddsSelecoes e null.
- Nao multiplique nem some odds voce mesmo: apenas liste as individuais em oddsSelecoes.
- retornoTotal e o retorno/pagamento do bilhete quando a aposta ja foi ganha; null se perdida, em aberto ou ausente.
- oddOriginal so existe quando o bilhete mostra a odd ANTES do boost junto da final (riscada, tachada, menor, com rotulo de boost/super odds/turbinada). E a odd total pre-boost do mesmo bilhete, sempre menor que odd. Sem boost visivel, retorne null.
- Ignore odds individuais de selecoes e odds de outros eventos nos dois campos.
- Stake e somente o valor efetivamente apostado, nunca saldo, retorno, cashout ou limite.`;

// O bot recebe a casa na legenda da foto; o app web nao tem legenda, entao
// pede a casa no proprio print. Regra e schema ficam separados pra que o
// caminho do Telegram continue com exatamente o mesmo prompt de antes.
// Print de bilhete grande nao cabe numa tela: o app manda as partes como
// imagens separadas do MESMO bilhete e a IA precisa saber disso, senao le a
// segunda parte como uma aposta nova.
export const BET_MULTI_IMAGE_RULE = `
- As imagens enviadas sao partes do MESMO bilhete (print dividido em pedacos, com sobreposicao entre eles). Leia todas como UMA unica aposta: junte as selecoes na ordem, sem repetir selecao que aparece em mais de uma imagem.`;

export const BET_HOUSE_RULE = `
- casa e o nome da casa de apostas dona do bilhete (logo, cabecalho ou marca d'agua da tela). Retorne null se nao estiver visivel.`;

export const BET_IMAGE_SCHEMA = {
  type: 'object',
  properties: {
    evento: { type: ['string', 'null'] },
    esporte: { type: ['string', 'null'] },
    mercado: { type: ['string', 'null'] },
    odd: { type: ['number', 'null'] },
    oddOriginal: { type: ['number', 'null'] },
    oddsSelecoes: { type: ['array', 'null'], items: { type: 'number' } },
    retornoTotal: { type: ['number', 'null'] },
    stake: { type: ['number', 'null'] },
  },
  required: [
    'evento',
    'esporte',
    'mercado',
    'odd',
    'oddOriginal',
    'oddsSelecoes',
    'retornoTotal',
    'stake',
  ],
  additionalProperties: false,
} as const;

export interface ExtractedBetSlip {
  evento: string | null;
  esporte: string | null;
  mercado: string | null;
  odd: number | null;
  // Odd antes do boost/turbinada; null quando o bilhete nao mostra boost.
  oddOriginal: number | null;
  stake: number | null;
  // Odd que o bilhete nao mostrava e saiu de conta nossa (produto das odds das
  // selecoes, ou retorno/stake). O app pede conferencia quando isso e true.
  // Opcional porque o caminho de texto/audio nao calcula nada.
  oddCalculada?: boolean;
}

// Responsabilidade única: IMAGEM -> DADOS. Não conhece Telegram, banco nem
// botão. Quem chama é que combina isso com casa/horário.
@Injectable()
export class BetSlipParserService {
  async extractBetFromImage({
    imageBuffer,
    mimeType,
    extraImages = [],
    deep = false,
    withHouse = false,
  }: {
    imageBuffer: Buffer;
    mimeType: string;
    // Partes adicionais do MESMO bilhete, na ordem em que o usuario mandou.
    extraImages?: { buffer: Buffer; mimeType: string }[];
    deep?: boolean;
    withHouse?: boolean;
  }): Promise<ExtractedBetSlip & { casa?: string | null }> {
    const images = [
      { buffer: imageBuffer, mimeType },
      ...extraImages,
    ].map(
      (img) =>
        `data:${img.mimeType};base64,${img.buffer.toString('base64')}`,
    );
    const startedAt = Date.now();

    const response = await getOpenAIClient().responses.create({
      model: MODEL,
      reasoning: { effort: deep ? 'low' : 'none' },
      // A chave tem que casar com o prefixo real do prompt — a regra de
      // multi-imagem muda o texto, entao cachear junto do simples so derrubaria
      // o hit das duas variantes.
      prompt_cache_key:
        (withHouse ? 'bet-image-extractor-house-v3' : 'bet-image-extractor-v3') +
        (images.length > 1 ? '-multi' : ''),
      prompt_cache_options: { mode: 'implicit', ttl: '30m' },
      input: [
        {
          role: 'user',
          content: [
            {
              type: 'input_text',
              text:
                BET_IMAGE_PROMPT +
                (withHouse ? BET_HOUSE_RULE : '') +
                (images.length > 1 ? BET_MULTI_IMAGE_RULE : ''),
            },
            ...images.map((image_url) => ({
              type: 'input_image' as const,
              image_url,
              detail: (deep ? 'high' : 'original') as 'high' | 'original',
            })),
          ],
        },
      ],
      text: {
        format: {
          type: 'json_schema',
          name: 'bet_image_extraction',
          strict: true,
          schema: (withHouse
            ? {
                ...BET_IMAGE_SCHEMA,
                properties: {
                  ...BET_IMAGE_SCHEMA.properties,
                  casa: { type: ['string', 'null'] },
                },
                required: [...BET_IMAGE_SCHEMA.required, 'casa'],
              }
            : BET_IMAGE_SCHEMA) as unknown as Record<string, unknown>,
        },
      },
    },
    { timeout: AI_TIMEOUT_MS, maxRetries: 0 },
    );

    const usage = response.usage;
    console.log(
      `[BET_IMAGE_AI] model=${MODEL} mode=${deep ? 'deep' : 'standard'} images=${images.length} input=${usage?.input_tokens ?? '?'} ` +
        `cached=${usage?.input_tokens_details?.cached_tokens ?? 0} ` +
        `cache_write=${usage?.input_tokens_details?.cache_write_tokens ?? 0} ` +
        `output=${usage?.output_tokens ?? '?'} total=${usage?.total_tokens ?? '?'} ` +
        `reasoning=${usage?.output_tokens_details?.reasoning_tokens ?? '?'} ` +
        `duration=${((Date.now() - startedAt) / 1000).toFixed(2)}s`,
    );

    const data = parseExtractionObject(response.output_text);
    const extracted = normalizeExtraction(data);
    return withHouse
      ? {
          ...extracted,
          casa: typeof data.casa === 'string' ? data.casa.trim() || null : null,
        }
      : extracted;
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
): ExtractedBetSlip {
  const data = normalizeBetData({
    game: obj.evento,
    market: obj.mercado,
    sport: obj.esporte,
    odd: obj.odd,
    stake: obj.stake,
  });
  // Boost so e boost se a IA devolveu duas odds coerentes: a original tem que
  // ser uma odd de verdade e menor que a final. Fora disso vira null, pra
  // ninguem exibir "3.65 -> 3.65" nem uma original maior que a que vale.
  const oddOriginal = normalizeBetNumber(obj.oddOriginal);
  // Multipla grande costuma nao mostrar a odd total, so aposta e retorno. A
  // odd sai do produto das odds das selecoes (vale ganha ou perdida) e, na
  // falta delas, de retorno/stake — que so existe em bilhete ganho.
  const odd = data.odd ?? oddFromSlip(obj, data.stake);
  return {
    evento: data.game,
    mercado: data.market,
    esporte: data.sport,
    odd,
    // Só aparece quando a odd veio de conta nossa — o objeto é comparado
    // inteiro em vários testes e caminhos, e uma chave a mais em todo print
    // normal não paga o ruído.
    ...(data.odd === null && odd !== null ? { oddCalculada: true } : {}),
    oddOriginal:
      oddOriginal !== null &&
      oddOriginal > 1 &&
      data.odd !== null &&
      oddOriginal < data.odd
        ? oddOriginal
        : null,
    stake: data.stake,
  };
}

// Odd deduzida do bilhete quando a casa nao imprime a total. Produto das
// selecoes primeiro: ele nao depende do resultado da aposta. retorno/stake so
// entra como ultimo recurso, e so faz sentido em bilhete ganho.
function oddFromSlip(
  obj: Record<string, unknown>,
  stake: number | null,
): number | null {
  const legs = Array.isArray(obj.oddsSelecoes)
    ? obj.oddsSelecoes.map(normalizeBetNumber)
    : [];
  if (legs.length && legs.every((odd) => odd !== null && odd > 1)) {
    const product = legs.reduce<number>((acc, odd) => acc * (odd as number), 1);
    return Number(product.toFixed(2));
  }

  const retorno = normalizeBetNumber(obj.retornoTotal);
  if (retorno !== null && retorno > 0 && stake !== null && stake > 0) {
    const odd = Number((retorno / stake).toFixed(2));
    return odd > 1 ? odd : null;
  }
  return null;
}
