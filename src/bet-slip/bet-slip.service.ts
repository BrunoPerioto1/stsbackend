import {
  BadRequestException,
  BadGatewayException,
  Injectable,
  UnprocessableEntityException,
} from '@nestjs/common';
import { BetSlipParserService } from './bet-slip-parser.service';
import { PendingMatchService } from './pending-match.service';
import { GrokService } from '../telegram/grok.service';
import { HouseService } from '../house/house.service';
import type { ParsedBetSlipDto } from './dto/parse-image.dto';

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

// Mimetype do multipart vem do cliente e mente fácil; os magic bytes não.
const SIGNATURES: { mime: string; test: (b: Buffer) => boolean }[] = [
  {
    mime: 'image/png',
    test: (b) =>
      b
        .subarray(0, 8)
        .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  },
  {
    mime: 'image/jpeg',
    test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  },
  {
    mime: 'image/webp',
    test: (b) =>
      b.subarray(0, 4).toString('ascii') === 'RIFF' &&
      b.subarray(8, 12).toString('ascii') === 'WEBP',
  },
];

export function detectImageMime(buffer: Buffer): string | null {
  if (buffer.length < 12) return null;
  return SIGNATURES.find((s) => s.test(buffer))?.mime ?? null;
}

// Confiança aqui é heurística, não probabilidade do modelo: a Responses API
// não devolve logprob por campo. Serve só pro app decidir o que marcar em
// amarelo pedindo conferência — nunca pra decidir sozinho.
const SURE = 0.9;
const CHECK = 0.55;

@Injectable()
export class BetSlipService {
  constructor(
    private readonly parser: BetSlipParserService,
    private readonly pendingMatchService: PendingMatchService,
    private readonly grokService: GrokService,
    private readonly houseService: HouseService,
  ) {}

  async parseImage({
    userId,
    buffer,
    houseHint,
  }: {
    userId: number;
    buffer: Buffer;
    houseHint?: string;
  }): Promise<ParsedBetSlipDto> {
    const mimeType = detectImageMime(buffer);
    if (!mimeType)
      throw new BadRequestException(
        'Formato não suportado. Envie um print em PNG, JPG ou WebP.',
      );
    if (buffer.length > MAX_IMAGE_BYTES)
      throw new BadRequestException('Imagem acima de 5 MB.');

    // Só pede a casa ao modelo quando o app não sabe qual é — a casa escolhida
    // no select é sempre mais confiável que a logo lida do print.
    let extracted: Awaited<
      ReturnType<BetSlipParserService['extractBetFromImage']>
    >;
    try {
      extracted = await this.parser.extractBetFromImage({
        imageBuffer: buffer,
        mimeType,
        withHouse: !houseHint,
      });
    } catch (err) {
      const reason = (err as Error).message;
      console.error('[BET_SLIP_PARSE] status=error reason=%s', reason);
      throw new BadGatewayException(
        reason === 'OPENAI_API_KEY_AUSENTE'
          ? 'Leitura por imagem não está configurada no servidor.'
          : 'Não consegui ler esse print agora. Tente de novo em instantes.',
      );
    }

    // "Não é um bilhete" é quando nada do que define uma aposta apareceu. Um
    // campo faltando é bilhete cortado, e aí vale devolver o que deu — o
    // usuário completa no formulário.
    if (!extracted.evento && !extracted.mercado && extracted.odd === null)
      throw new UnprocessableEntityException(
        'Não encontrei um bilhete nessa imagem. Tente um print da aposta confirmada, com evento, odd e valor visíveis.',
      );

    const houseName = houseHint?.trim() || extracted.casa || null;
    const houseId = houseName
      ? await this.grokService.resolveHouseId(`🏠 ${houseName}`)
      : null;
    const house = houseId
      ? (((await this.houseService.getAllHouses()) ?? []).find(
          (h) => h.id === houseId,
        ) ?? null)
      : null;

    const at = new Date();
    const matchedTips = house
      ? await this.pendingMatchService
          .findMatches(userId, {
            game: extracted.evento ?? '',
            market: extracted.mercado ?? '',
            house: house.name,
            odd: extracted.odd ?? NaN,
            stake: extracted.stake ?? NaN,
            at,
          })
          .then((rows) =>
            rows.map(({ candidate, score }) => ({
              tipId: candidate.tipId,
              score: Number(score.toFixed(2)),
              event: candidate.game,
              market: candidate.market,
              odd: Number.isFinite(candidate.odd) ? candidate.odd : null,
              stake: Number.isFinite(candidate.stake)
                ? Number(candidate.stake.toFixed(2))
                : null,
              at: candidate.at.toISOString(),
            })),
          )
      : [];

    return {
      event: extracted.evento,
      market: extracted.mercado,
      sport: extracted.esporte,
      house: house ? { id: house.id, name: house.name } : null,
      odd: extracted.odd,
      originalOdd: extracted.oddOriginal,
      stake: extracted.stake,
      confidence: {
        event: extracted.evento ? SURE : 0,
        // Múltipla é onde o modelo mais erra seleção — o app pede conferência.
        market: !extracted.mercado
          ? 0
          : extracted.mercado.includes(' / ')
            ? CHECK
            : SURE,
        // Casa vinda do select do usuário é certeza; lida da logo, não.
        house: !house ? 0 : houseHint ? 1 : CHECK,
        sport: extracted.esporte ? SURE : 0,
        odd: extracted.odd === null ? 0 : SURE,
        stake: extracted.stake === null ? 0 : SURE,
      },
      matchedTips,
    };
  }
}
