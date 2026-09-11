import { Injectable } from '@nestjs/common';
import { UsersService } from '../users/users.service';
import { TipsService } from '../tips/tips.service';
import {
  extractGameFromText,
  extractHouseFromText,
  extractLimitFromText,
  extractMarketFromText,
  extractOddFromText,
} from '../telegram/utils/tip-extractors.util';
import {
  findBetMatches,
  MATCH_MAX_AGE_MS,
  type BetMatchInput,
  type PendingCandidate,
} from './matching.util';

// Linha do resumo de tips, com o mínimo que o matching precisa. A query
// devolve mais colunas; tipar só estas evita espalhar `any` pelo mapeamento.
interface TipSummaryRow {
  id: number;
  text: string;
  percent: number | string | null;
  createdAt: string | Date;
  betId: number | null;
  dismissalId: number | null;
}

// Pendencias do usuario que ainda podem ser a aposta do bilhete. So I/O — o
// scoring continua no matching.util, puro. Nao conhece Telegram nem HTTP: quem
// chama passa um userId, seja o clique no bot ou a rota do app.
@Injectable()
export class PendingMatchService {
  constructor(
    private readonly usersService: UsersService,
    private readonly tipsService?: TipsService,
  ) {}

  // A janela e a mesma que o scorer ja exige (24h), pra nao varrer o historico
  // inteiro de tips a cada bilhete.
  async loadCandidates(userId: number, at: Date): Promise<PendingCandidate[]> {
    if (!this.tipsService) return [];
    const user = await this.usersService.findById(userId);
    if (!user) return [];
    const [rows, userStake] = await Promise.all([
      this.tipsService.getSummaryForUser(
        user.id,
        user.minPercentFilter != null ? Number(user.minPercentFilter) : null,
        new Date(at.getTime() - MATCH_MAX_AGE_MS),
      ),
      this.usersService.getUserStake(user.id),
    ]);
    return (rows as unknown as TipSummaryRow[])
      .filter((row) => row.betId == null && row.dismissalId == null)
      .map((row) => {
        // Mesma conta do processBetText: a tip so tem a % da banca, a stake
        // absoluta vem dai (e do limite, quando ele corta).
        const percent = row.percent != null ? Number(row.percent) : null;
        const limit = extractLimitFromText(row.text);
        let stake = percent !== null ? (percent / 100) * userStake : NaN;
        if (limit !== null && Number.isFinite(stake))
          stake = Math.min(stake, limit);
        return {
          // O driver devolve id como string quando a coluna e bigint — sem
          // este Number o tipId viaja como texto ate o POST /bets e o
          // @IsNumber do DTO recusa o vinculo com 400.
          tipId: Number(row.id),
          game: extractGameFromText(row.text) ?? '',
          market: extractMarketFromText(row.text) ?? '',
          house: extractHouseFromText(row.text) ?? '',
          odd: extractOddFromText(row.text) ?? NaN,
          stake,
          at: new Date(row.createdAt),
        };
      });
  }

  // Pendencia indisponivel nao pode derrubar a leitura do bilhete — sem
  // sugestao e melhor que erro.
  async findMatches(userId: number, bet: BetMatchInput) {
    const candidates = await this.loadCandidates(userId, bet.at).catch(() => {
      console.warn('[BET_MATCH] pendentes_indisponiveis=true');
      return [] as PendingCandidate[];
    });
    return findBetMatches(bet, candidates);
  }
}
