import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import {
  normalizeBetData,
  detectPotentialDuplicate,
  DUPLICATE_WINDOW_MS,
  type BetOrigin,
} from './bet-normalization';
import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ResultIdEnum } from './dto/result-id.enum';
import { CreateBetDto } from './dto/bet.dto';
import { UpdateApostaDto, PaginatedBetsResponseDto } from './dto/bet.dto';
import {
  BetRepository,
  type FilterGetBets,
} from '../infra/repository/bet.repository';
import { SportEventRepository } from '../infra/repository/sport-event.repository';
import { createMatchCache, matchEvent, matchEvents } from './event-matching';
import type { NewBetEvent } from '../db_types/BetEvents';
import { calculateProfit } from '../common/utils/bet.utils';
import { BetFilterDto } from './dto/bet-filter.dto';
import type { BetId, NewBet, UpdateBet } from '../db_types/Bet';
import type { BettingHouseId } from '../db_types/BettingHouse';
import type { UserId } from '../db_types/Users';
import type { TipId } from '../db_types/Tips';

// Segunda aposta viva pra mesma (usuario, tip): o indice uq_bets_user_tip
// recusou. Quem chama trata como "ja planilhada", nao como erro.
export class TipAlreadyPlanilhadaException extends ConflictException {
  constructor() {
    super('Essa tip já foi planilhada.');
  }
}

function isTipUniqueViolation(error: unknown): boolean {
  const pg = error as { code?: string; constraint?: string } | null;
  return pg?.code === '23505' && pg.constraint === 'uq_bets_user_tip';
}

@Injectable()
export class BetService {
  private readonly logger = new Logger(BetService.name);

  constructor(
    private readonly betRepository: BetRepository,
    private readonly sportEventRepository: SportEventRepository,
  ) {}

  // Descobre a data/hora real do jogo a partir do cache de eventos. Consultivo
  // por definicao: sem match confiavel devolve tudo null, e qualquer falha aqui
  // e' engolida — planilhar a aposta nunca pode depender disso.
  private async resolveEvent(
    game: string,
    market: string,
    sport: string,
    betTime: Date,
  ) {
    const vazio = {
      evento: {
        eventExternalId: null,
        eventProvider: null,
        eventStartAt: null,
        eventMatchConfidence: null,
      },
      pernas: [] as Omit<NewBetEvent, 'betId'>[],
    };
    try {
      const candidatos =
        await this.sportEventRepository.findCandidates(betTime);
      const cache = createMatchCache();

      // Multipla de varios jogos: guarda cada confronto que casou, mesmo que
      // outro nao tenha casado — e' o que deixa liquidar perna por perna depois
      // que sport_events ja' apagou o jogo. Confronto sem match nao vira linha.
      const confrontos = matchEvents(game, market, candidatos, sport, cache);
      const pernas =
        confrontos.length > 1
          ? confrontos.flatMap(({ confronto, position, match }) =>
              match
                ? [
                    {
                      position,
                      confronto,
                      provider: match.provider,
                      externalId: match.externalId,
                      startAt: match.startAt,
                      matchConfidence: match.confidence,
                    },
                  ]
                : [],
            )
          : [];

      const match = matchEvent(game, market, candidatos, sport, cache);
      if (!match) {
        this.logger.log(`[EVENT_MATCH] result=no_match legs=${pernas.length}`);
        return { ...vazio, pernas };
      }
      this.logger.log(
        `[EVENT_MATCH] result=matched confidence=${match.confidence.toFixed(3)} legs=${pernas.length}`,
      );
      return {
        evento: {
          eventExternalId: match.externalId,
          eventProvider: match.provider,
          eventStartAt: match.startAt,
          eventMatchConfidence: match.confidence,
        },
        pernas,
      };
    } catch (error) {
      this.logger.warn(`[EVENT_MATCH] result=error ${(error as Error).message}`);
      return vazio;
    }
  }

  // tipId é opcional e não faz parte do CreateBetDto público da API HTTP —
  // só o TelegramService passa isso, pra ligar a aposta à tip do grupo que
  // deu origem a ela (usado pelo /pendentes pra saber o que já foi tratado).
  async createBet(
    betData: CreateBetDto,
    tipId?: number,
    origin: BetOrigin = { source: 'app', sourceType: 'manual' },
  ) {
    const normalized = normalizeBetData(betData);
    const validated = plainToInstance(CreateBetDto, {
      ...betData,
      ...normalized,
    });
    const errors = validateSync(validated);
    if (errors.length || normalized.odd === null || normalized.odd <= 1) {
      this.logger.warn(
        `[VALIDATION_FAILED] stage=create_bet fields=${errors.map((error) => error.property).join(',') || 'odd'}`,
      );
      throw new BadRequestException('Dados da aposta inválidos.');
    }
    betData = validated;
    const newBet: NewBet = {
      source: origin.source,
      sourceType: origin.sourceType,
      telegramMessageId:
        origin.source === 'telegram' ? origin.telegramMessageId : undefined,
      telegramChatId:
        origin.source === 'telegram' ? origin.telegramChatId : undefined,
      game: betData.game,
      stake: betData.stake,
      odd: betData.odd,
      market: betData.market,
      sport: betData.sport,
      userId: betData.userId as UserId,
      houseId:
        betData.houseId != null ? (betData.houseId as BettingHouseId) : null,
      tipId: tipId != null ? (tipId as TipId) : null,
      betTime: betData.betTime ? new Date(betData.betTime) : undefined,
    };

    // betTime segue sendo quando a aposta foi criada — o evento so acrescenta
    // quando o jogo comeca, sem substituir nada.
    const { evento, pernas } = await this.resolveEvent(
      betData.game,
      betData.market,
      betData.sport,
      newBet.betTime ?? new Date(),
    );
    Object.assign(newBet, evento);

    const now = new Date();
    const candidates =
      betData.houseId == null
        ? []
        : await this.betRepository.findRecentCandidates(
            betData.userId as UserId,
            betData.houseId as BettingHouseId,
            new Date(now.getTime() - DUPLICATE_WINDOW_MS),
            now,
          );
    const duplicate = detectPotentialDuplicate(betData, candidates, now);
    if (duplicate.isPotentialDuplicate)
      this.logger.log(
        '[DUPLICATE_DETECTED] reason=same_event_market_odd_stake_recent',
      );
    let result: Awaited<ReturnType<BetRepository['create']>>;
    try {
      result = await this.betRepository.create(newBet);
    } catch (error) {
      if (isTipUniqueViolation(error)) throw new TipAlreadyPlanilhadaException();
      throw error;
    }

    if (!result) {
      throw new InternalServerErrorException();
    }

    // Consultivo como o evento: a aposta ja' existe, falha aqui so' deixa a
    // multipla sem liquidacao automatica.
    if (pernas.length) {
      try {
        await this.betRepository.saveBetEvents(result.id, pernas);
      } catch (error) {
        this.logger.warn(`[EVENT_MATCH] result=legs_error ${(error as Error).message}`);
      }
    }

    const { id, ...createdParams } = result;

    return { id, ...createdParams, duplicate };
  }

  async updateBet(betId: number, updateData: UpdateApostaDto, userId: number) {
    // O profit e derivado de (resultId, stake, odd, cashoutValue). Ate aqui o
    // update gravava os campos novos e deixava o profit antigo, entao editar a
    // stake/odd de uma aposta ja liquidada mantinha o lucro velho no banco —
    // em qualquer status liquidado, nao so em GANHA. Recalcula quando a edicao
    // toca algum desses campos e a aposta ja tem resultado.
    // O UpdateApostaDto nao expoe cashoutValue (so o finalizeBet define esse
    // valor), entao a edicao so pode mexer em stake/odd.
    const touchesProfitInput =
      updateData.stake !== undefined || updateData.odd !== undefined;
    const touchesEventInput =
      updateData.game !== undefined ||
      updateData.market !== undefined ||
      updateData.sport !== undefined;

    const patch: UpdateBet = { ...(updateData as UpdateBet) };
    let pernas: Omit<NewBetEvent, 'betId'>[] | null = null;

    if (touchesProfitInput || touchesEventInput) {
      const current = await this.betRepository.findById(betId as BetId);
      if (!current) {
        throw new NotFoundException(`Bet with ID ${betId} not found`);
      }

      // Jogo/mercado/esporte novos: o evento casado na criacao e' de outro
      // jogo e a liquidacao usaria o placar dele. Refaz o casamento so' quando
      // o texto mudou de fato — o front manda os tres em toda edicao, e depois
      // que sport_events apaga o jogo (2 dias) refazer a toa perderia um
      // evento certo. Sem match novo o evento fica vazio, nunca o antigo.
      const game = updateData.game ?? current.game;
      const market = updateData.market ?? current.market;
      const sport = updateData.sport ?? current.sport;
      const eventInputChanged =
        game.trim() !== current.game.trim() ||
        market.trim() !== current.market.trim() ||
        sport.trim() !== current.sport.trim();
      if (eventInputChanged) {
        const resolved = await this.resolveEvent(
          game,
          market,
          sport,
          updateData.betTime ? new Date(updateData.betTime) : current.betTime,
        );
        Object.assign(patch, resolved.evento);
        pernas = resolved.pernas;
      }

      if (touchesProfitInput && current.resultId != null) {
        const stake = updateData.stake ?? Number(current.stake);
        const odd = updateData.odd ?? Number(current.odd);
        const cashoutValue =
          current.cashoutValue == null
            ? undefined
            : Number(current.cashoutValue);

        patch.profit = calculateProfit(
          current.resultId as ResultIdEnum,
          Number(stake),
          Number(odd),
          cashoutValue,
        );
      }
    }

    const updated = await this.betRepository.update(
      betId as BetId,
      patch,
      userId as UserId,
    );
    if (!updated) {
      throw new NotFoundException(`Bet with ID ${betId} not found`);
    }

    // Consultivo como na criacao: falha aqui so' deixa a multipla sem
    // liquidacao automatica por perna.
    if (pernas) {
      try {
        await this.betRepository.replaceBetEvents(updated.id, pernas);
      } catch (error) {
        this.logger.warn(`[EVENT_MATCH] result=legs_error ${(error as Error).message}`);
      }
    }
    return updated;
  }

  async finalizeBet(
    betId: number,
    resultId: ResultIdEnum,
    userId: number,
    cashoutValue?: number,
  ) {
    const bet = await this.betRepository.findById(betId as BetId);
    if (!bet) {
      throw new NotFoundException(`Bet with ID ${betId} not found`);
    }
    const resultIdEnum = resultId;

    if (resultIdEnum === ResultIdEnum.CASHOUT && cashoutValue == null) {
      throw new BadRequestException(
        'cashoutValue é obrigatório para finalizar como Cashout.',
      );
    }

    const profit = calculateProfit(
      resultIdEnum,
      Number(bet.stake),
      Number(bet.odd),
      cashoutValue,
    );

    const updated = await this.betRepository.finalizeBet(
      betId as BetId,
      resultIdEnum,
      profit,
      userId as UserId,
      cashoutValue,
    );
    if (!updated) {
      throw new NotFoundException(
        `Bet with ID ${betId} not found for this user.`,
      );
    }
    return updated;
  }

  async finalizeMany(betIds: number[], resultId: ResultIdEnum, userId: number) {
    if (resultId === ResultIdEnum.CASHOUT) {
      throw new BadRequestException(
        'Cashout precisa de um valor por aposta e não pode ser aplicado em lote. Finalize essas apostas individualmente.',
      );
    }

    const rows = await this.betRepository.findByIds(
      betIds as BetId[],
      userId as UserId,
    );

    const idToBet: Record<number, { stake: number; odd: number }> = {};
    for (const row of rows) {
      idToBet[row.id] = { stake: row.stake, odd: row.odd };
    }

    const betProfitsWithResultId = betIds.map((id) => {
      const bet = idToBet[id];
      const profit = bet ? calculateProfit(resultId, bet.stake, bet.odd) : 0;
      return { betId: id as BetId, resultId, profit };
    });

    const updatedBets = await this.betRepository.finalizeMultipleBets(
      betProfitsWithResultId,
      userId as UserId,
    );

    return {
      success: true,
      updatedCount: updatedBets.length,
      results: updatedBets,
    };
  }

  private toRepositoryFilter(filters: BetFilterDto): FilterGetBets {
    if (
      filters.startDate &&
      filters.endDate &&
      new Date(filters.startDate) > new Date(filters.endDate)
    ) {
      throw new BadRequestException(
        'A data inicial não pode ser maior que a data final.',
      );
    }

    return {
      betId: filters.betId,
      userId: filters.userId,
      startDate: filters.startDate ? new Date(filters.startDate) : undefined,
      endDate: filters.endDate ? new Date(filters.endDate) : undefined,
      resultId: filters.resultId,
      resultIds: filters.resultIds,
      houseIds: filters.houseIds,
      sportIds: filters.sportIds,
      origins: filters.origins,
      unmatched: filters.unmatched,
      q: filters.q,
      page: filters.page ?? 1,
      perPage: filters.perPage ?? 30,
    } as FilterGetBets;
  }

  async getMonthlySummary(filters: BetFilterDto) {
    return this.betRepository.monthlySummary(this.toRepositoryFilter(filters));
  }

  // Faixa de totais da lista: o filtro inteiro, não só a página ou o mês aberto.
  async getTotals(filters: BetFilterDto) {
    const raw = await this.betRepository.totals(this.toRepositoryFilter(filters));
    const settledStake = Number(raw.settledStake);
    const profit = Number(raw.profit);
    const won = Number(raw.won);
    const lost = Number(raw.lost);
    return {
      count: Number(raw.count),
      staked: Number(raw.staked),
      settledStake,
      profit,
      won,
      lost,
      pending: Number(raw.pending),
      roi: settledStake > 0 ? profit / settledStake : 0,
      hitRate: won + lost > 0 ? won / (won + lost) : 0,
    };
  }

  async findBets(filters: BetFilterDto): Promise<PaginatedBetsResponseDto> {
    const repositoryFilter = this.toRepositoryFilter(filters);

    const [bets, total] = await Promise.all([
      this.betRepository.findBets(repositoryFilter),
      this.betRepository.countBets(repositoryFilter),
    ]);

    return {
      total,
      totalPages: repositoryFilter.perPage
        ? Math.ceil(total / repositoryFilter.perPage)
        : 1,
      data: bets as PaginatedBetsResponseDto['data'],
    };
  }

  // Usadas pelo /pendentes: saber se a tip ja virou aposta (clique repetido)
  // e desfazer o planilhamento devolvendo a tip pra lista.
  async findBetByTip(tipId: number, userId: number) {
    return this.betRepository.findByTipId(tipId as TipId, userId as UserId);
  }

  async deleteBetByTip(tipId: number, userId: number) {
    const bet = await this.findBetByTip(tipId, userId);
    if (!bet) return null;
    await this.betRepository.delete(bet.id, userId as UserId);
    return bet;
  }

  async deleteBet(betId: number, userId: number) {
    const deleted = await this.betRepository.delete(
      betId as BetId,
      userId as UserId,
    );
    if (!deleted) {
      throw new NotFoundException(`Aposta com ID ${betId} não encontrada.`);
    }
    return { success: true, message: `Aposta ${betId} deletada com sucesso` };
  }

  async deleteManyBets(betIds: number[], userId: number) {
    const deletedRows = await this.betRepository.deleteMany(
      betIds as BetId[],
      userId as UserId,
    );
    return {
      success: true,
      deletedCount: deletedRows.length,
      message: `${deletedRows.length} apostas deletadas com sucesso`,
    };
  }

  async getSports() {
    return this.betRepository.sports();
  }

  async getResultTypes() {
    return this.betRepository.resultTypes();
  }
}
