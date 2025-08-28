import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { pool } from '../infra/db/db';
import { ResultIdEnum } from '../infra/dto/result-id.enum';
import { CreateBetDto } from '../infra/dto/new-bet.dto';
import { UpdateApostaDto } from '../infra/dto/update-bet.dto';
import { BetRepository } from '../infra/repository/bet.repository';

@Injectable()
export class ApostaService {
  constructor(private readonly betRepository: BetRepository) {}
  // Esta função continua igual, pois é útil para o cálculo em memória
  private calcularLucro(
    resultId: ResultIdEnum,
    stake: number,
    odd: number,
  ): number {
    switch (resultId) {
      case ResultIdEnum.GANHOU:
        return stake * (odd - 1);
      case ResultIdEnum.PERDEU:
        return -stake;
      case ResultIdEnum.EMPATE:
      case ResultIdEnum.ANULADA:
      case ResultIdEnum.REEMBOLSADA:
      case ResultIdEnum.PENDENTE:
        return 0;
      case ResultIdEnum.MEIO_GANHO:
      case ResultIdEnum.MEIO_GANHO_2:
        return (stake / 2) * (odd - 1) - stake / 2;
      case ResultIdEnum.MEIO_PERDIDO:
        return -(stake / 2);
      default:
        throw new BadRequestException('Result ID inválido');
    }
  }

  async createBet(betData: CreateBetDto) {
      // Validar casa_id contra o banco para evitar violação de FK
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
    // validar existência do casa_id se presente
      if (updateData.casa_id !== undefined && updateData.casa_id !== null) {
      const exists = await this.betRepository.houseExists(Number(updateData.casa_id));
      if (!exists) {
        // se a casa não existir, gravar como NULL
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
  
    // Calcular lucro baseado no resultado
    let lucro = 0;
    if (resultId === 1) { // GANHOU
      lucro = (Number(aposta.stake) * Number(aposta.odd)) - Number(aposta.stake);
    } else if (resultId === 2) { // PERDEU
      lucro = -Number(aposta.stake);
    }
    await this.betRepository.updateProfit(betId, lucro);
    const result = await this.betRepository.updateResult(betId, resultId as ResultIdEnum);
    return result;
  }
  async finalizeMany(betIds: number[], resultId: ResultIdEnum) {
      // Buscar stakes/odds para calcular lucros em memória
    const rows = await this.betRepository.findByIds(betIds);
      const idToBet: Record<number, { stake: number; odd: number }> = {};
    for (const row of rows) {
        idToBet[row.id] = { stake: row.stake, odd: row.odd };
      }

    await this.betRepository.updateMultipleResults(betIds, resultId);

    const results = betIds.map((id) => {
        const bet = idToBet[id];
      const lucro = bet ? this.calcularLucro(resultId, bet.stake, bet.odd) : 0;
        return { apostaId: id, resultId, lucro };
      });

      return { success: true, updatedCount: results.length, results };
  }

  // Esta query está PERFEITA para o seu requisito, pois calcula o lucro na hora da consulta
  private get baseQuery() {
    return `
      SELECT 
        a.*,
        c.nome AS casa_nome,
        ar.result_id,
        CASE
          WHEN ar.result_id = ${ResultIdEnum.GANHOU} THEN a.stake * (a.odd - 1)
          WHEN ar.result_id = ${ResultIdEnum.PERDEU} THEN -a.stake
          WHEN ar.result_id IN (${ResultIdEnum.EMPATE}, ${ResultIdEnum.ANULADA}, ${ResultIdEnum.REEMBOLSADA}) THEN 0
          WHEN ar.result_id IN (${ResultIdEnum.MEIO_GANHO}, ${ResultIdEnum.MEIO_GANHO_2}) THEN (a.stake / 2) * (a.odd - 1) - (a.stake / 2)
          WHEN ar.result_id = ${ResultIdEnum.MEIO_PERDIDO} THEN -(a.stake / 2)
          ELSE 0
        END AS lucro_calculado
      FROM apostas a
      LEFT JOIN casas_aposta c ON c.id = a.casa_id
      LEFT JOIN aposta_results ar ON a.id = ar.aposta_id
    `;
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
