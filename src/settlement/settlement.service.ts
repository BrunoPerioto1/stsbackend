import { Injectable, Logger } from '@nestjs/common';
import { SettlementRepository } from '../infra/repository/settlement.repository';
import { BetService } from '../bet/bet.service';
import { splitConfronto } from '../bet/event-matching';
import { UserId } from '../db_types/Users';
import { BetId } from '../db_types/Bet';
import { ResultIdEnum } from '../bet/dto/result-id.enum';
import { settleBet } from './settle';

@Injectable()
export class SettlementService {
  private readonly logger = new Logger(SettlementService.name);

  constructor(
    private readonly repository: SettlementRepository,
    private readonly betService: BetService,
  ) {}

  // Lote de uma recomputacao. O repositorio so' devolve aposta cuja sugestao
  // esta' desatualizada, entao o que sobrar do lote continua candidato na
  // chamada seguinte — nenhuma aposta fica presa fora da janela.
  private static readonly LOTE = 200;

  /**
   * Recalcula as sugestoes das apostas pendentes com jogo ja' encerrado.
   *
   * Nao escreve resultado nenhum: so' popula bet_settlement_suggestions, que a
   * tela de conferencia mostra pro usuario confirmar.
   */
  async computeSuggestions(userId: UserId) {
    const bets = await this.repository.findSettleable(
      userId,
      SettlementService.LOTE,
    );
    const suggestions = bets.map((bet) => {
      // O placar vem do provider na ordem dele (mandante primeiro). Os nomes
      // saem de sport_events quando o cache ainda tem o jogo; senao, do texto
      // da aposta, que ja' foi casado com esse mesmo evento na criacao.
      const doTexto = splitConfronto(bet.game);
      const teams = {
        home: bet.homeName ?? doTexto?.home ?? '',
        away: bet.awayName ?? doTexto?.away ?? '',
      };
      const score =
        bet.homeScore != null && bet.awayScore != null
          ? { home: bet.homeScore, away: bet.awayScore }
          : null;

      const settlement = settleBet(bet.market, teams, score, bet.eventStatus);
      return {
        betId: bet.id,
        suggestedResultId: settlement.resultId,
        reason: settlement.reason,
        explanation: settlement.explanation,
        homeScore: bet.homeScore,
        awayScore: bet.awayScore,
      };
    });

    await this.repository.saveSuggestions(suggestions);

    const decididas = suggestions.filter((s) => s.suggestedResultId != null);
    this.logger.log(
      `usuario ${userId}: ${bets.length} apostas com placar, ` +
        `${decididas.length} com sugestao`,
    );
    return {
      analyzed: bets.length,
      suggested: decididas.length,
      undecided: suggestions.length - decididas.length,
      // Lote cheio: pode ter sobrado backlog. A tela chama de novo em vez de
      // deixar aposta antiga sem sugestao pra sempre.
      hasMore: bets.length === SettlementService.LOTE,
    };
  }

  async listSuggestions(userId: UserId) {
    const rows = await this.repository.findPendingSuggestions(userId);
    return rows.map((row) => ({
      betId: row.betId,
      game: row.game,
      market: row.market,
      stake: Number(row.stake),
      odd: Number(row.odd),
      eventStartAt: row.eventStartAt,
      suggestedResultId: row.suggestedResultId as ResultIdEnum,
      explanation: row.explanation,
      homeScore: row.homeScore,
      awayScore: row.awayScore,
    }));
  }

  /**
   * Confirma as sugestoes escolhidas — e' o unico caminho pelo qual a
   * liquidacao automatica vira resultado de verdade.
   *
   * Reusa o fluxo de finalizacao que ja existe (mesmo calculo de lucro, mesma
   * transacao), agrupando por resultado sugerido.
   */
  async confirm(betIds: BetId[], userId: UserId) {
    // O filtro vai no SQL: so' as sugestoes que o usuario marcou voltam do
    // banco, em vez de trazer a lista toda pra descartar quase tudo aqui.
    const pendentes = await this.repository.findPendingSuggestions(
      userId,
      betIds,
    );
    const porResultado = new Map<ResultIdEnum, BetId[]>();

    for (const sugestao of pendentes) {
      const resultId = sugestao.suggestedResultId as ResultIdEnum;
      const grupo = porResultado.get(resultId);
      if (grupo) grupo.push(sugestao.betId);
      else porResultado.set(resultId, [sugestao.betId]);
    }

    let confirmadas = 0;
    for (const [resultId, ids] of porResultado) {
      await this.betService.finalizeMany(ids, resultId, userId);
      confirmadas += ids.length;
    }
    this.logger.log(`usuario ${userId}: ${confirmadas} apostas planilhadas`);
    return { confirmed: confirmadas };
  }

  async dismiss(betIds: BetId[], userId: UserId) {
    // Conta o que o UPDATE atingiu, nao o que veio no body: id de outro usuario
    // e' filtrado no repositorio e nao pode aparecer como recusado.
    const dismissed = await this.repository.dismiss(betIds, userId);
    return { dismissed };
  }
}
