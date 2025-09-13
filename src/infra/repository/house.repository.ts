import { Injectable, NotFoundException } from '@nestjs/common';
import { pool } from '../db/db'; 
import { HouseDto, FindByIdDto, FindAllHousesDTO } from '../../house/dto/house.dto';
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

  async findHouseMetrics(userId: number): Promise<HouseDto> {
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
        LEFT JOIN bets b ON bh.id = b.house_id AND b.user_id = $1
        LEFT JOIN bet_results br ON b.id = br.bet_id
        LEFT JOIN house_transactions ht ON bh.id = ht.house_id
        WHERE bh.is_active = true
      ),
      total_houses AS (
        SELECT COUNT(DISTINCT bh.id) AS total_houses_used
        FROM betting_houses bh
        INNER JOIN bets b ON bh.id = b.house_id AND b.user_id = $1
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
    const result = await pool.query(query, [userId]);
    return result.rows[0];
  }

async getAllHousesBalanceWithCalculations(filter: HouseFilterDto, userId: number): Promise<HouseDto[]> {
  const params: any[] = [userId];
  let paramIndex = 1;
  let query = `
    WITH house_bets AS (
      SELECT 
        h.id AS house_id,
        h.name AS house_name,
        COUNT(b.id) AS total_bets,
        COALESCE(SUM(b.stake), 0) AS total_stake,
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
        COUNT(CASE WHEN br.result_id = 9 THEN 1 END) AS pending_bets,
        COUNT(CASE WHEN br.result_id = 1 THEN 1 END) AS won_bets,
        COUNT(CASE WHEN br.result_id = 2 THEN 1 END) AS lost_bets
      FROM betting_houses h
      INNER JOIN bets b ON h.id = b.house_id AND b.user_id = $${paramIndex}
      LEFT JOIN bet_results br ON b.id = br.bet_id
      WHERE h.is_active = true
  `;
  paramIndex++;
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
        COALESCE(SUM(CASE WHEN tt.name = 'DEPOSIT' THEN ht.value ELSE 0 END), 0) AS total_deposit,
        COALESCE(SUM(CASE WHEN tt.name = 'WITHDRAWAL' THEN ht.value ELSE 0 END), 0) AS total_withdrawal,
        COALESCE(SUM(ht.value), 0) AS total_transactions
      FROM house_transactions ht
      LEFT JOIN transaction_types tt ON ht.transaction_type_id = tt.id
      WHERE 1=1
  `;
  if (filter?.houseId) {
    query += ` AND ht.house_id = $${paramIndex}`;
    params.push(filter.houseId);
    paramIndex++;
  }
  if (filter?.houseName) {
    query += ` AND ht.house_id IN (SELECT id FROM betting_houses WHERE name ILIKE $${paramIndex})`;
    params.push(`%${filter.houseName}%`);
    paramIndex++;
  }
  query += `
      GROUP BY ht.house_id
    )
    SELECT 
      hb.house_id AS "houseId",
      hb.house_name AS "houseName",
      hb.total_bets AS "totalBets",
      hb.total_stake AS "totalStake",
      hb.total_bet_profit AS "totalBetProfit",
      COALESCE(ht.total_deposit, 0) AS "totalDeposit",
      COALESCE(ht.total_withdrawal, 0) AS "totalWithdrawal",
      COALESCE(ht.total_transactions, 0) AS "totalTransactions",
      (hb.total_return + COALESCE(ht.total_transactions, 0)) AS "realHouseBalance",
      GREATEST(0, (hb.total_return + COALESCE(ht.total_transactions, 0))) AS "houseBalance",
      hb.pending_bets AS "pendingBets",
      hb.won_bets AS "wonBets",
      hb.lost_bets AS "lostBets"
    FROM house_bets hb
    LEFT JOIN house_transactions ht ON hb.house_id = ht.house_id
    ORDER BY hb.house_name ASC;
  `;
  const result = await pool.query(query, params);
  return result.rows;
}

async findallHouses(): Promise<FindAllHousesDTO[]> {
  const query = `
    SELECT id, name, is_active AS "active"
    FROM betting_houses
    WHERE is_active = true
    ORDER BY name ASC
  `;
  const result = await pool.query(query);
  return result.rows;

}
}