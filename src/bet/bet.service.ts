import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { pool } from '../infra/db/db';
import { ResultIdEnum } from './dto/result-id.enum';
import { CreateBetDto } from './dto/bet.dto';
import { UpdateApostaDto,BetItem } from './dto/bet.dto';
import { BetRepository } from '../infra/repository/bet.repository';
import { calculateProfit } from '../common/utils/bet.utils';
import { BetFilterDto } from './dto/bet-filter.dto';

@Injectable()
export class ApostaService {
  constructor(private readonly betRepository: BetRepository) {}


  async createBet(betData: CreateBetDto) {
    let finalHouseId: number | null = betData.houseId ?? null;
    if (finalHouseId !== null) {
     
    }

    const created = await this.betRepository.create({
      ...betData,
      casa_id: finalHouseId ?? undefined,
    } as CreateBetDto);

    return { id: created.id, ...betData, casa_id: finalHouseId ?? undefined };
  }

  async updateBet(betId: number, updateData: UpdateApostaDto, userId: number) {
    const updated = await this.betRepository.update(betId, updateData, userId);
    if (!updated) {
      throw new NotFoundException(`Aposta com ID ${betId} não encontrada.`);
    }
    return updated;
  }

  async finalizeBet(betId: number, resultId: number, userId: number) {
    const aposta = await this.betRepository.findById(betId);
     const resultIdEnum = resultId as ResultIdEnum;
    
    const profit = calculateProfit(
      resultIdEnum,
      Number(aposta.stake),
      Number(aposta.odd)
    );
    
    const updated = await this.betRepository.finalizeBetUpdate(betId, resultIdEnum, profit, userId);
    if (!updated) {
      throw new NotFoundException(`Aposta com ID ${betId} não encontrada para este usuário.`);
    }
    return updated;
  }
async finalizeMany(betIds: number[], resultId: ResultIdEnum, userId: number) {
  const rows = await this.betRepository.findByIds(betIds, userId);

  const idToBet: Record<number, { stake: number; odd: number }> = {};
  for (const row of rows) {
    idToBet[row.id] = { stake: row.stake, odd: row.odd };
  }

  const betProfitsWithResultId = betIds.map((id) => {
    const bet = idToBet[id];
    const profit = bet ? calculateProfit(resultId, bet.stake, bet.odd) : 0;
    return { betId: id, resultId, profit };
  });

  const updatedBets = await this.betRepository.finalizeMultipleBets(betProfitsWithResultId, userId);

  return { 
    success: true, 
    updatedCount: updatedBets.length, 
    results: updatedBets 
  };
}

  async findBets(filters: BetFilterDto): Promise<BetItem[] | BetItem | null> {
  

    if (filters.startDate && filters.endDate && new Date(filters.startDate) > new Date(filters.endDate)) {
      throw new BadRequestException('A data inicial não pode ser maior que a data final.');
    }

    const bets = await this.betRepository.findBets(filters);

    return bets;
  }

  async deleteBet(betId: number, userId: number) {
    const deleted = await this.betRepository.delete(betId, userId);
    if (!deleted) {
      throw new NotFoundException(`Aposta com ID ${betId} não encontrada.`);
    }
    return { success: true, message: `Aposta ${betId} deletada com sucesso` };
  }

  async deleteManyBets(betIds: number[], userId: number) {
    const count = await this.betRepository.deleteMany(betIds, userId);
      return { 
        success: true, 
      deletedCount: count,
      message: `${count} apostas deletadas com sucesso`,
    };
  }

  async getResultTypes(): Promise<{ id: number; name: string }[]> {
    return this.betRepository.resultTypes();
}
}