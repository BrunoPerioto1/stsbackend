import { Injectable, NotFoundException } from '@nestjs/common';
import { pool } from '../db/db'; 
import { HouseDto, FindByIdDto } from '../../house/dto/house.dto';
import { HouseFilterDto } from '../../house/dto/house.filter.dto';
import camelcaseKeys from 'camelcase-keys';

export interface HouseBalance {
  house_id: number;
  house_name: string;
  total_bets: number;
  total_stake: number;
  total_bet_profit: number;
  total_transactions: number;
  house_balance: number;
  real_house_balance: number;
  pending_bets: number;
  won_bets: number;
  lost_bets: number;
}

@Injectable()
export class HouseRepository {

  async findById(id: number): Promise<FindByIdDto> {
    const query = `
      SELECT id, name, is_active
      FROM betting_houses
      WHERE id = $1
    `;
    const params = [id];
    const result = await pool.query(query, params);
    return camelcaseKeys(result.rows[0]);
  
  }

  async findHouseMetrics(): Promise<HouseDto> {
    const query = `
      WITH house_metrics AS (
        SELECT 
          COALESCE(SUM(b.stake), 0) AS total_invested,
          COUNT(b.id) AS total_bets,
          COALESCE(SUM(b.profit), 0) AS total_bet_profit,
          COALESCE(SUM(
            CASE 
              WHEN br.result_id = 1 THEN b.stake + b.profit
              WHEN br.result_id = 2 THEN b.profit
              WHEN br.result_id = 9 THEN b.stake
              WHEN br.result_id = 4 THEN b.stake
              ELSE 0
            END
          ), 0) AS total_return,
          COALESCE(SUM(ht.value), 0) AS transaction_balance
        FROM betting_houses bh
        LEFT JOIN bets b ON bh.id = b.house_id
        LEFT JOIN bet_results br ON b.id = br.bet_id
        LEFT JOIN house_transactions ht ON bh.id = ht.house_id
        WHERE bh.is_active = true
      ),
      total_houses AS (
        SELECT COUNT(DISTINCT bh.id) AS total_houses_used
        FROM betting_houses bh
        INNER JOIN bets b ON bh.id = b.house_id
        WHERE bh.is_active = true
      )
      SELECT 
        hm.total_invested AS "totalInvested",
        (hm.total_return + hm.transaction_balance) AS "currentBalance",
        hm.total_bet_profit AS "totalProfit",
        hm.total_bets AS "totalBets",
        th.total_houses_used AS "totalHousesUsed"
      FROM house_metrics hm
      CROSS JOIN total_houses th;
    `;
    const result = await pool.query(query);
    return result.rows[0];
  }

async getAllHousesBalanceWithCalculations(filter?: HouseFilterDto): Promise<HouseDto[]> {
  let query = `
    WITH house_bets AS (
      SELECT 
        h.id as house_id,
        h.name as house_name,
        COUNT(b.id) as total_bets,
        COALESCE(SUM(b.stake), 0) as total_stake,
        COALESCE(SUM(b.profit), 0) as total_bet_profit,
        COALESCE(SUM(
          CASE 
            WHEN br.result_id = 1 THEN b.stake + b.profit   
            WHEN br.result_id = 2 THEN b.profit             
            WHEN br.result_id = 9 THEN b.stake
            WHEN br.result_id = 4 THEN b.stake
            ELSE 0                                          
          END
        ), 0) as total_return,
        COUNT(CASE WHEN br.result_id = 9 THEN 1 END) as pending_bets,
        COUNT(CASE WHEN br.result_id = 1 THEN 1 END) as won_bets,
        COUNT(CASE WHEN br.result_id = 2 THEN 1 END) as lost_bets
      FROM betting_houses h
      INNER JOIN bets b ON h.id = b.house_id
      LEFT JOIN bet_results br ON b.id = br.bet_id
      WHERE h.is_active = true
  `;

  const params: any[] = [];
  let paramIndex = 1;

  if (filter?.houseId) {
    query += ` AND h.id = $${paramIndex}`;
    params.push(filter.houseId);
    paramIndex++;
  }

  if (filter?.houseName) {
    query += ` AND h.name ILIKE $${paramIndex}`;
    params.push(`%${filter.houseName}%`);
    paramIndex++;
  }

  query += `
      GROUP BY h.id, h.name
    ),
    house_transactions AS (
      SELECT 
        ht.house_id,
        COALESCE(SUM(
          CASE 
            WHEN tt.name = 'DEPOSIT' THEN ht.value
            WHEN tt.name = 'WITHDRAWAL' THEN -ht.value
            WHEN tt.name = 'ADJUSTMENT' THEN ht.value
            ELSE 0
          END
        ), 0) as total_transactions
      FROM house_transactions ht
      LEFT JOIN transaction_types tt ON ht.transaction_type_id = tt.id
  `;

  if (filter?.houseId) {
    query += ` WHERE ht.house_id = $${paramIndex}`;
    params.push(filter.houseId);
    paramIndex++;
  }

  query += `
      GROUP BY ht.house_id
    )
    SELECT 
      hb.house_id as "houseId",
      hb.house_name as "houseName",
      hb.total_bets as "totalBets",
      hb.total_stake as "totalStake",
      hb.total_bet_profit as "totalBetProfit",
      COALESCE(ht.total_transactions, 0) as "totalTransactions",
      (hb.total_return + COALESCE(ht.total_transactions, 0)) as "realHouseBalance",
      GREATEST(0, (hb.total_return + COALESCE(ht.total_transactions, 0))) as "houseBalance",
      hb.pending_bets as "pendingBets",
      hb.won_bets as "wonBets",
      hb.lost_bets as "lostBets"
    FROM house_bets hb
    LEFT JOIN house_transactions ht ON hb.house_id = ht.house_id
    ORDER BY hb.house_name ASC;
  `;

  const result = await pool.query(query, params);
  return result.rows;
}
}
