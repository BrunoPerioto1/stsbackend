import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { pool } from '../infra/db/db';
import { ResultIdEnum } from './dto/result-id.enum';
import { CreateBetDto } from './dto/new-bet.dto';
import { UpdateApostaDto } from './dto/update-bet.dto';
import { BetRepository } from '../infra/repository/bet.repository';
import { calculateProfit } from '../common/utils/bet.utils';

@Injectable()
export class ApostaService {
  constructor(private readonly betRepository: BetRepository) {}


  async createBet(betData: CreateBetDto) {
    let finalHouseId: number | null = betData.house_id ?? null;
    if (finalHouseId !== null) {
      const exists = await this.betRepository.houseExists(Number(finalHouseId));
      if (!exists) {
        console.warn(`house_id ${finalHouseId} não existe em casas_aposta; gravando NULL`);
        finalHouseId = null;
      }
    }

    const created = await this.betRepository.create({
      ...betData,
      casa_id: finalHouseId ?? undefined,
    } as CreateBetDto);

    return { id: created.id, ...betData, casa_id: finalHouseId ?? undefined };
  }

  async updateBet(betId: number, updateData: UpdateApostaDto) {
      if (updateData.house_id !== undefined && updateData.house_id !== null) {
      const exists = await this.betRepository.houseExists(Number(updateData.house_id));
      if (!exists) {
        (updateData as any).casa_id = undefined;
      }
    }

    const updated = await this.betRepository.update(betId, updateData);
    if (!updated) {
      throw new NotFoundException(`Aposta com ID ${betId} não encontrada.`);
    }
    return updated;
  }

  async finalizeBet(betId: number, resultId: number) {
    const aposta = await this.findBetById(betId);
    if (!aposta) {
      throw new Error('Aposta não encontrada');
    }
  
    const resultIdEnum = resultId as ResultIdEnum;
    
    const lucro = calculateProfit(resultIdEnum, Number(aposta.stake), Number(aposta.odd));
    
    await this.betRepository.updateProfit(betId, lucro);
    const result = await this.betRepository.updateResult(betId, resultIdEnum);
    return result;
  }
  async finalizeMany(betIds: number[], resultId: ResultIdEnum) {
    const rows = await this.betRepository.findByIds(betIds);
      const idToBet: Record<number, { stake: number; odd: number }> = {};
    for (const row of rows) {
        idToBet[row.id] = { stake: row.stake, odd: row.odd };
      }

    const betProfits = betIds.map((id) => {
      const bet = idToBet[id];
      const lucro = bet ? calculateProfit(resultId, bet.stake, bet.odd) : 0;
      return { betId: id, profit: lucro };
    });

    // Atualizar resultados e lucros no banco
    await this.betRepository.updateMultipleResults(betIds, resultId);
    await this.betRepository.updateMultipleProfits(betProfits);

    const results = betIds.map((id) => {
        const bet = idToBet[id];
      const lucro = bet ? calculateProfit(resultId, bet.stake, bet.odd) : 0;
        return { apostaId: id, resultId, lucro };
      });

      return { success: true, updatedCount: results.length, results };
  }


  async findAllBets() {
    return this.betRepository.findAll();
  }

  async findBetById(betId: number) {
    const row = await this.betRepository.findById(betId);
    if (!row) {
      throw new NotFoundException(`Aposta com ID ${betId} não encontrada.`);
    }
    return row;
  }

  async findUniqueHouses() {
    const client = await pool.connect();
    try {
      const query = 'SELECT DISTINCT casa FROM apostas ORDER BY casa ASC';
      const res = await client.query(query);
      return res.rows.map(row => row.casa);
    } finally {
      client.release();
    }
  }

  async deleteBet(betId: number) {
    const deleted = await this.betRepository.delete(betId);
    if (!deleted) {
      throw new NotFoundException(`Aposta com ID ${betId} não encontrada.`);
    }
    return { success: true, message: `Aposta ${betId} deletada com sucesso` };
  }

  async deleteManyBets(betIds: number[]) {
    const count = await this.betRepository.deleteMany(betIds);
      return { 
        success: true, 
      deletedCount: count,
      message: `${count} apostas deletadas com sucesso`,
    };
  }
}
