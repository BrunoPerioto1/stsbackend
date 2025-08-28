import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { pool } from './db';
import { ResultIdEnum } from './result-id.enum';
import { CreateApostaDto } from './dto/create-aposta.dto';
import { UpdateApostaDto } from './dto/update-aposta.dto';

@Injectable()
export class ApostaService {
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

  async criarAposta(apostaData: CreateApostaDto) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Validar casa_id contra o banco para evitar violação de FK
      let casaIdFinal: number | null = apostaData.casa_id ?? null;
      if (casaIdFinal !== null) {
        const check = await client.query('SELECT 1 FROM casas_aposta WHERE id = $1', [casaIdFinal]);
        if (check.rowCount === 0) {
          console.warn(`casa_id ${casaIdFinal} não existe em casas_aposta; gravando NULL`);
          casaIdFinal = null;
        }
      }

      const insertApostaQuery = `
        INSERT INTO apostas (jogo, stake, odd, casa_id, mercado, esporte)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING id
      `;
      const apostaResult = await client.query(insertApostaQuery, [
        apostaData.jogo,
        apostaData.stake,
        apostaData.odd,
        casaIdFinal,
        apostaData.mercado,
        apostaData.esporte,
      ]);
      const apostaId = apostaResult.rows[0].id;

      const insertApostaResultQuery = `
        INSERT INTO aposta_results (aposta_id, result_id) VALUES ($1, $2)
      `;
      await client.query(insertApostaResultQuery, [
        apostaId,
        ResultIdEnum.PENDENTE,
      ]);

      await client.query('COMMIT');
      return { id: apostaId, ...apostaData, casa_id: casaIdFinal ?? undefined };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async editarAposta(apostaId: number, updateData: UpdateApostaDto) {
    const client = await pool.connect();
    try {
      console.log('Dados recebidos no service:', updateData);
      
      // Verificar se a aposta existe
      const existingAposta = await client.query(
        'SELECT id FROM apostas WHERE id = $1',
        [apostaId],
      );
      if (existingAposta.rowCount === 0) {
        throw new NotFoundException(
          `Aposta com ID ${apostaId} não encontrada.`,
        );
      }

      // Construir query de atualização dinamicamente
      const updateFields: string[] = [];
      const updateValues: any[] = [];
      let paramIndex = 1;

      // Tratar cada campo individualmente com validação
      if (updateData.jogo !== undefined && updateData.jogo !== null && updateData.jogo.trim() !== '') {
        updateFields.push(`jogo = $${paramIndex++}`);
        updateValues.push(updateData.jogo.trim());
      }
      
      if (updateData.stake !== undefined && updateData.stake !== null && updateData.stake > 0) {
        updateFields.push(`stake = $${paramIndex++}`);
        updateValues.push(Number(updateData.stake));
      }
      
      if (updateData.odd !== undefined && updateData.odd !== null && updateData.odd > 1) {
        updateFields.push(`odd = $${paramIndex++}`);
        updateValues.push(Number(updateData.odd));
      }
      
      if (updateData.casa_id !== undefined && updateData.casa_id !== null) {
        // validar existência do casa_id
        const check = await client.query('SELECT 1 FROM casas_aposta WHERE id = $1', [Number(updateData.casa_id)]);
        if (check.rowCount > 0) {
          updateFields.push(`casa_id = $${paramIndex++}`);
          updateValues.push(Number(updateData.casa_id));
        } else {
          updateFields.push(`casa_id = NULL`);
        }
      }
      
      if (updateData.mercado !== undefined && updateData.mercado !== null && updateData.mercado.trim() !== '') {
        updateFields.push(`mercado = $${paramIndex++}`);
        updateValues.push(updateData.mercado.trim());
      }
      
      if (updateData.esporte !== undefined && updateData.esporte !== null && updateData.esporte.trim() !== '') {
        updateFields.push(`esporte = $${paramIndex++}`);
        updateValues.push(updateData.esporte.trim());
      }
      
      if (updateData.data_hora !== undefined && updateData.data_hora !== null && updateData.data_hora.trim() !== '') {
        updateFields.push(`data_hora = $${paramIndex++}`);
        updateValues.push(updateData.data_hora);
      }

      if (updateFields.length === 0) {
        throw new BadRequestException('Nenhum campo para atualizar foi fornecido.');
      }

      // Adicionar updated_at
      updateFields.push(`updated_at = NOW()`);

      const updateQuery = `
        UPDATE apostas 
        SET ${updateFields.join(', ')}
        WHERE id = $${paramIndex}
        RETURNING *
      `;
      updateValues.push(apostaId);

      console.log('Query de atualização:', updateQuery);
      console.log('Valores:', updateValues);

      const result = await client.query(updateQuery, updateValues);
      return result.rows[0];
    } finally {
      client.release();
    }
  }

  async finalizarAposta(apostaId: number, resultId: number) {
    const aposta = await this.buscarApostaPorId(apostaId);
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
  
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Atualizar aposta com lucro
      const updateQuery = `
        UPDATE apostas 
        SET lucro = $1, updated_at = NOW()
        WHERE id = $2
        RETURNING *
      `;
      
      await client.query(updateQuery, [lucro, apostaId]);
    
      // Atualizar resultado
      const resultQuery = `
        UPDATE aposta_results 
        SET result_id = $1, updated_at = NOW()
        WHERE aposta_id = $2
        RETURNING *
      `;
      
      const result = await client.query(resultQuery, [resultId, apostaId]);
      
      await client.query('COMMIT');
      return result.rows[0];
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }
  async finalizarMultiplas(apostaIds: number[], resultId: ResultIdEnum) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Buscar stakes/odds para calcular lucros em memória
      const res = await client.query(
        'SELECT id, stake, odd FROM apostas WHERE id = ANY($1)',
        [apostaIds],
      );
      const idToBet: Record<number, { stake: number; odd: number }> = {};
      for (const row of res.rows) {
        idToBet[row.id] = { stake: row.stake, odd: row.odd };
      }

      // Atualizar resultados em massa
      await client.query(
        'UPDATE aposta_results SET result_id = $1 WHERE aposta_id = ANY($2)',
        [resultId, apostaIds],
      );

      await client.query('COMMIT');

      // Montar resposta com lucros calculados
      const results = apostaIds.map((id) => {
        const bet = idToBet[id];
        const lucro = bet
          ? this.calcularLucro(resultId, bet.stake, bet.odd)
          : 0;
        return { apostaId: id, resultId, lucro };
      });

      return { success: true, updatedCount: results.length, results };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
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

  async listarTodasApostas() {
    const client = await pool.connect();
    try {
      const query = `${this.baseQuery} ORDER BY a.data_hora DESC`;
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
        throw new NotFoundException(
          `Aposta com ID ${apostaId} não encontrada.`,
        );
      }
      return res.rows[0];
    } finally {
      client.release();
    }
  }

  async listarCasasUnicas() {
    const client = await pool.connect();
    try {
      const query = 'SELECT DISTINCT casa FROM apostas ORDER BY casa ASC';
      const res = await client.query(query);
      return res.rows.map(row => row.casa);
    } finally {
      client.release();
    }
  }

  async deletarAposta(apostaId: number) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Verificar se a aposta existe
      const existingAposta = await client.query(
        'SELECT id FROM apostas WHERE id = $1',
        [apostaId],
      );
      if (existingAposta.rowCount === 0) {
        throw new NotFoundException(
          `Aposta com ID ${apostaId} não encontrada.`,
        );
      }

      // Deletar a aposta (aposta_results será deletada automaticamente por CASCADE)
      await client.query('DELETE FROM apostas WHERE id = $1', [apostaId]);

      await client.query('COMMIT');
      return { success: true, message: `Aposta ${apostaId} deletada com sucesso` };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async deletarMultiplas(apostaIds: number[]) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Verificar se todas as apostas existem
      const existingApostas = await client.query(
        'SELECT id FROM apostas WHERE id = ANY($1)',
        [apostaIds],
      );
      
      if (existingApostas.rowCount !== apostaIds.length) {
        const foundIds = existingApostas.rows.map(row => row.id);
        const missingIds = apostaIds.filter(id => !foundIds.includes(id));
        throw new NotFoundException(
          `Apostas não encontradas: ${missingIds.join(', ')}`,
        );
      }

      // Deletar as apostas (aposta_results será deletada automaticamente por CASCADE)
      await client.query('DELETE FROM apostas WHERE id = ANY($1)', [apostaIds]);

      await client.query('COMMIT');
      return { 
        success: true, 
        deletedCount: apostaIds.length,
        message: `${apostaIds.length} apostas deletadas com sucesso` 
      };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }
}
