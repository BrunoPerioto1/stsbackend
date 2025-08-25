import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { pool } from './db';
import { ResultIdEnum } from './result-id.enum';

@Injectable()
export class ApostaService {

  // Esta função continua igual, pois é útil para o cálculo em memória
  private calcularLucro(resultId: ResultIdEnum, stake: number, odd: number): number {
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
        return (stake / 2) * (odd - 1) - (stake / 2);
      case ResultIdEnum.MEIO_PERDIDO:
        return -(stake / 2);
      default:
        throw new BadRequestException('Result ID inválido');
    }
  }

  async criarAposta(apostaData: {
    jogo: string;
    stake: number;
    odd: number;
    casa: string;
    mercado: string;
    esporte: string;
  }) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const insertApostaQuery = `
        INSERT INTO apostas (jogo, stake, odd, casa, mercado, esporte, data)
        VALUES ($1, $2, $3, $4, $5, $6, NOW())
        RETURNING id
      `;
      const apostaResult = await client.query(insertApostaQuery, [
        apostaData.jogo,
        apostaData.stake,
        apostaData.odd,
        apostaData.casa,
        apostaData.mercado,
        apostaData.esporte,
      ]);
      const apostaId = apostaResult.rows[0].id;

      const insertApostaResultQuery = `
        INSERT INTO aposta_results (aposta_id, result_id) VALUES ($1, $2)
      `;
      await client.query(insertApostaResultQuery, [apostaId, ResultIdEnum.PENDENTE]);

      await client.query('COMMIT');
      return { id: apostaId, ...apostaData };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async finalizarAposta(apostaId: number, resultId: ResultIdEnum) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const apostaRes = await client.query('SELECT stake, odd FROM apostas WHERE id = $1', [apostaId]);
      if (apostaRes.rowCount === 0) {
        throw new NotFoundException(`Aposta com ID ${apostaId} não encontrada.`);
      }

      const aposta = apostaRes.rows[0];
      // O cálculo do lucro continua aqui, para que possamos retorná-lo na resposta da API
      const lucro = this.calcularLucro(resultId, aposta.stake, aposta.odd);

      // ✅ ALTERAÇÃO PRINCIPAL AQUI: A query agora só atualiza o result_id
      await client.query(
        'UPDATE aposta_results SET result_id = $1 WHERE aposta_id = $2',
        [resultId, apostaId]
      );

      await client.query('COMMIT');
      // A resposta para o front-end ainda contém o lucro calculado, o que é ótimo para feedback imediato
      return { apostaId, resultId, lucro };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async finalizarMultiplas(apostaIds: number[], resultId: ResultIdEnum) {
      const results: { apostaId: number; resultId: ResultIdEnum; lucro: number; }[] = [];
      
      for (const id of apostaIds) {
          const result = await this.finalizarAposta(id, resultId);
          results.push(result);
      }
      return { success: true, updatedCount: results.length, results };
  }

  // Esta query está PERFEITA para o seu requisito, pois calcula o lucro na hora da consulta
  private get baseQuery() {
    return `
      SELECT 
        a.*,
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
      LEFT JOIN aposta_results ar ON a.id = ar.aposta_id
    `;
  }

  async listarTodasApostas() {
    const client = await pool.connect();
    try {
      const query = `${this.baseQuery} ORDER BY a.data DESC`;
      const res = await client.query(query);
      return res.rows;
    } finally {
      client.release();
    }
  }

  async buscarApostaPorId(apostaId: number) {
    const client = await pool.connect();
    try {
      const query = `${this.baseQuery} WHERE a.id = $1`;
      const res = await client.query(query, [apostaId]);
      if (res.rowCount === 0) {
        throw new NotFoundException(`Aposta com ID ${apostaId} não encontrada.`);
      }
      return res.rows[0];
    } finally {
      client.release();
    }
  }
}