import {
  Injectable,
  NotFoundException,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { ResultIdEnum } from './dto/result-id.enum';
import { CreateBetDto } from './dto/bet.dto';
import { UpdateApostaDto, PaginatedBetsResponseDto } from './dto/bet.dto';
import {
  BetRepository,
  type FilterGetBets,
} from '../infra/repository/bet.repository';
import { calculateProfit } from '../common/utils/bet.utils';
import { BetFilterDto } from './dto/bet-filter.dto';
import type { BetId, NewBet, UpdateBet } from '../db_types/Bet';
import type { BettingHouseId } from '../db_types/BettingHouse';
import type { UserId } from '../db_types/Users';
import type { ResultId } from '../db_types/Results';
import type { TipId } from '../db_types/Tips';

@Injectable()
export class BetService {
  constructor(private readonly betRepository: BetRepository) {}

  // tipId é opcional e não faz parte do CreateBetDto público da API HTTP —
  // só o TelegramService passa isso, pra ligar a aposta à tip do grupo que
  // deu origem a ela (usado pelo /pendentes pra saber o que já foi tratado).
  async createBet(betData: CreateBetDto, tipId?: number) {
    const newBet: NewBet = {
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

    const result = await this.betRepository.create(newBet);

    if (!result) {
      throw new InternalServerErrorException();
    }

    const { id, ...createdParams } = result;

    return { id, ...createdParams };
  }

  async updateBet(betId: number, updateData: UpdateApostaDto, userId: number) {
    const updated = await this.betRepository.update(
      betId as BetId,
      updateData as UpdateBet,
      userId as UserId,
    );
    if (!updated) {
      throw new NotFoundException(`Bet with ID ${betId} not found`);
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

  async findBets(filters: BetFilterDto): Promise<PaginatedBetsResponseDto> {
    if (
      filters.startDate &&
      filters.endDate &&
      new Date(filters.startDate) > new Date(filters.endDate)
    ) {
      throw new BadRequestException(
        'A data inicial não pode ser maior que a data final.',
      );
    }

    const repositoryFilter = {
      betId: filters.betId,
      userId: filters.userId,
      startDate: filters.startDate ? new Date(filters.startDate) : undefined,
      endDate: filters.endDate ? new Date(filters.endDate) : undefined,
      resultId: filters.resultId,
      resultIds: filters.resultIds,
      houseIds: filters.houseIds,
      q: filters.q,
      page: filters.page ?? 1,
      perPage: filters.perPage ?? 30,
    } as FilterGetBets;

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

  async getResultTypes() {
    return this.betRepository.resultTypes();
  }
}
