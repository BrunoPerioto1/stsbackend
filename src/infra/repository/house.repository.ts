import { Injectable, NotFoundException } from '@nestjs/common';
import { Pool } from 'pg';
import { pool } from '../db/db'; 
import { CreateHouseDto } from '../dto/new-house.dto';
import { UpdateHouseDto } from '../dto/update-house.dto';
import { CreateTransacaoDto } from '../dto/new-transation.dto';

export interface HouseBalance {
  house_id: number;
  house_name: string;
  house_slug: string;
  total_bets: number;
  total_stake: number;
  total_bet_profit: number;
  total_transactions: number;
  house_balance: number;
  pending_bets: number;
  won_bets: number;
  lost_bets: number;
}

@Injectable()
export class HouseRepository {
  async create(houseData: CreateHouseDto): Promise<any> {
    const query = `
      INSERT INTO betting_houses (name, is_active)
      VALUES ($1, $2)
      RETURNING *
    `;
    const params = [houseData.name, houseData.active ?? true];
    const result = await pool.query(query, params);
    return result.rows[0];
  }

  async findAll(): Promise<any[]> {
    const query = `
      SELECT id, name, is_active, created_at, updated_at
      FROM betting_houses
      ORDER BY name ASC
    `;
    const result = await pool.query(query);
    return result.rows;
  }

  async findById(id: number): Promise<any | null> {
    const query = `
      SELECT id, name, is_active, created_at, updated_at
      FROM betting_houses
      WHERE id = $1
    `;
    const params = [id];
    const result = await pool.query(query, params);
    return result.rowCount > 0 ? result.rows[0] : null;
  }

  async findBySlug(slug: string): Promise<any | null> {
    const query = `
      SELECT id, name, is_active, created_at, updated_at
      FROM betting_houses
      WHERE LOWER(name) = $1
    `;
    const params = [slug.toLowerCase()];
    const result = await pool.query(query, params);
    return result.rowCount > 0 ? result.rows[0] : null;
  }

  async update(id: number, updateData: UpdateHouseDto): Promise<any | null> {
    const query = `
      UPDATE betting_houses
      SET name = COALESCE($1, name),
          is_active = COALESCE($2, is_active),
          updated_at = NOW()
      WHERE id = $3
      RETURNING *
    `;
    const params = [updateData.name, updateData.active, id];
    const result = await pool.query(query, params);
    return result.rowCount > 0 ? result.rows[0] : null;
  }

  async delete(id: number): Promise<boolean> {
    const query = `
      DELETE FROM betting_houses
      WHERE id = $1
    `;
    const params = [id];
    const result = await pool.query(query, params);
    return result.rowCount > 0;
  }

  async findByNameOrSlug(text: string): Promise<any | null> {
    const query = `
      SELECT id, name, is_active
      FROM betting_houses
      WHERE LOWER(name) LIKE $1 AND is_active = true
      LIMIT 1
    `;
    const params = [`%${text.toLowerCase()}%`];
    const result = await pool.query(query, params);
    return result.rowCount > 0 ? result.rows[0] : null;
  }

  async calculateHouseBalance(houseId: number): Promise<HouseBalance | null> {
    const query = `
      SELECT 
        h.id as house_id,
        h.name as house_name,
        h.name as house_slug,
        COUNT(b.id) as total_bets,
        COALESCE(SUM(b.stake), 0) as total_stake,
        COALESCE(SUM(b.profit), 0) as total_bet_profit,
        COALESCE(SUM(ht.value), 0) as total_transactions,
        GREATEST(COALESCE(SUM(b.profit), 0) + COALESCE(SUM(ht.value), 0), 0) as house_balance,
        COUNT(CASE WHEN br.result_id = 9 THEN 1 END) as pending_bets,
        COUNT(CASE WHEN br.result_id = 1 THEN 1 END) as won_bets,
        COUNT(CASE WHEN br.result_id = 2 THEN 1 END) as lost_bets
      FROM betting_houses h
      LEFT JOIN bets b ON h.id = b.house_id
      LEFT JOIN bet_results br ON b.id = br.bet_id
      LEFT JOIN house_transactions ht ON h.id = ht.house_id
      WHERE h.id = $1 AND h.is_active = true
      GROUP BY h.id, h.name
    `;
    const params = [houseId];
    const result = await pool.query(query, params);
    return result.rowCount > 0 ? result.rows[0] : null;
  }

  async calculateAllHousesBalance(): Promise<HouseBalance[]> {
    const query = `
      SELECT 
        h.id as house_id,
        h.name as house_name,
        h.name as house_slug,
        COUNT(b.id) as total_bets,
        COALESCE(SUM(b.stake), 0) as total_stake,
        COALESCE(SUM(b.profit), 0) as total_bet_profit,
        COALESCE(SUM(ht.value), 0) as total_transactions,
        GREATEST(COALESCE(SUM(b.profit), 0) + COALESCE(SUM(ht.value), 0), 0) as house_balance,
        COUNT(CASE WHEN br.result_id = 9 THEN 1 END) as pending_bets,
        COUNT(CASE WHEN br.result_id = 1 THEN 1 END) as won_bets,
        COUNT(CASE WHEN br.result_id = 2 THEN 1 END) as lost_bets
      FROM betting_houses h
      LEFT JOIN bets b ON h.id = b.house_id
      LEFT JOIN bet_results br ON b.id = br.bet_id
      LEFT JOIN house_transactions ht ON h.id = ht.house_id
      WHERE h.is_active = true
      GROUP BY h.id, h.name
      ORDER BY h.name ASC
    `;
    const result = await pool.query(query);
    return result.rows;
  }

  async createTransaction(transactionData: CreateTransacaoDto): Promise<any> {
    const typeQuery = `
      SELECT id FROM transaction_types WHERE name = $1
    `;
    const typeResult = await pool.query(typeQuery, [transactionData.tipo]);

    if (typeResult.rowCount === 0) {
      throw new NotFoundException(`Transaction type '${transactionData.tipo}' not found`);
    }

    const transactionTypeId = typeResult.rows[0].id;

    const query = `
      INSERT INTO house_transactions (house_id, transaction_type_id, value, description)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `;
    const params = [
      transactionData.casa_id,
      transactionTypeId,
      transactionData.valor,
      transactionData.descricao
    ];
    const result = await pool.query(query, params);
    return result.rows[0];
  }

  async findTransactionsByHouse(houseId: number): Promise<any[]> {
    const query = `
      SELECT 
        ht.id, 
        ht.house_id, 
        tt.name as transaction_type,
        ht.value, 
        ht.description, 
        ht.created_at, 
        ht.updated_at
      FROM house_transactions ht
      LEFT JOIN transaction_types tt ON ht.transaction_type_id = tt.id
      WHERE ht.house_id = $1
      ORDER BY ht.created_at DESC
    `;
    const params = [houseId];
    const result = await pool.query(query, params);
    return result.rows;
  }

  async findAllTransactions(): Promise<any[]> {
    const query = `
      SELECT 
        ht.id, 
        ht.house_id, 
        h.name as house_name,
        tt.name as transaction_type,
        ht.value, 
        ht.description, 
        ht.created_at, 
        ht.updated_at
      FROM house_transactions ht
      LEFT JOIN betting_houses h ON ht.house_id = h.id
      LEFT JOIN transaction_types tt ON ht.transaction_type_id = tt.id
      ORDER BY ht.created_at DESC
    `;
    const result = await pool.query(query);
    return result.rows;
  }

  async findHouseHistory(houseId: number): Promise<any[]> {
    const betsQuery = `
      SELECT 
        b.id,
        b.game,
        b.stake,
        b.odd,
        b.market,
        b.sport,
        b.profit,
        b.bet_time as created_at,
        br.result_id,
        'BET' as movement_type
      FROM bets b
      LEFT JOIN bet_results br ON b.id = br.bet_id
      WHERE b.house_id = $1
    `;

    const transactionsQuery = `
      SELECT 
        ht.id,
        NULL as game,
        NULL as stake,
        NULL as odd,
        NULL as market,
        NULL as sport,
        ht.value as profit,
        ht.created_at,
        NULL as result_id,
        tt.name as movement_type
      FROM house_transactions ht
      LEFT JOIN transaction_types tt ON ht.transaction_type_id = tt.id
      WHERE ht.house_id = $1
    `;

    const [betsResult, transactionsResult] = await Promise.all([
      pool.query(betsQuery, [houseId]),
      pool.query(transactionsQuery, [houseId])
    ]);

    const history = [
      ...betsResult.rows.map(row => ({ ...row, movement_type: 'BET' })),
      ...transactionsResult.rows.map(row => ({ ...row, movement_type: row.movement_type }))
    ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    return history;
  }
}
