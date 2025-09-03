import { Injectable, NotFoundException } from '@nestjs/common';
import { pool } from '../db/db'; 
import { HouseDto, FindByIdDto,} from '../../house/dto/house.dto';
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


  async getBetsData(houseId?: number): Promise<any[]> {
    let query = `
      SELECT 
        h.id as house_id,
        h.name as house_name,
        COUNT(b.id) as total_bets,
        COALESCE(SUM(b.stake), 0) as total_stake,
        COALESCE(SUM(b.profit), 0) as total_bet_profit,
        -- 🔑 cálculo do retorno real das apostas
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
    if (houseId) {
      query += ` AND h.id = $1`;
      params.push(houseId);
    }
    
    query += ` GROUP BY h.id, h.name ORDER BY h.name ASC`;
    
    const result = await pool.query(query, params);
    return result.rows;
  }

  async getTransactionsData(houseId?: number): Promise<any[]> {
    let query = `
      SELECT 
        house_id,
        COALESCE(SUM(value), 0) as total_transactions
      FROM house_transactions
    `;
    
    const params: any[] = [];
    if (houseId) {
      query += ` WHERE house_id = $1`;
      params.push(houseId);
    }
    
    query += ` GROUP BY house_id`;
    
    const result = await pool.query(query, params);
    return result.rows;
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

  
  async findHouseBets(houseId: number): Promise<any[]> {
    const query = `
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

    const result = await pool.query(query, [houseId]);
    return result.rows;
  }

  async findHouseTransactions(houseId: number): Promise<any[]> {
    const query = `
      SELECT 
        ht.id,
        ht.value as profit,
        ht.created_at,
        tt.name as movement_type
      FROM house_transactions ht
      LEFT JOIN transaction_types tt ON ht.transaction_type_id = tt.id
      WHERE ht.house_id = $1
    `;

    const result = await pool.query(query, [houseId]);
    return result.rows;
  }

   async findHouseMetrics(): Promise<HouseDto> {
  const query = `
    WITH house_metrics AS (
      SELECT 
        COALESCE(SUM(b.stake), 0) as total_invested,
        
        COUNT(b.id) as total_bets,
        
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
        
        COALESCE(SUM(
          CASE 
            WHEN tt.name = 'DEPOSIT' THEN ht.value
            WHEN tt.name = 'WITHDRAWAL' THEN -ht.value
            WHEN tt.name = 'ADJUSTMENT' THEN ht.value
            ELSE 0
          END
        ), 0) as transaction_balance
        
      FROM betting_houses bh
      LEFT JOIN bets b ON bh.id = b.house_id
      LEFT JOIN bet_results br ON b.id = br.bet_id
      LEFT JOIN house_transactions ht ON bh.id = ht.house_id
      LEFT JOIN transaction_types tt ON ht.transaction_type_id = tt.id
      WHERE bh.is_active = true
    ),
    total_houses AS (
      SELECT COUNT(DISTINCT bh.id) as total_houses_used
      FROM betting_houses bh
      INNER JOIN bets b ON bh.id = b.house_id
      WHERE bh.is_active = true
    )
    SELECT 
      hm.total_invested as "totalInvested",
      (hm.total_return + hm.transaction_balance) as "currentBalance",
      hm.total_bet_profit as "totalProfit",
      hm.total_bets as "totalBets",
      th.total_houses_used as "totalHousesUsed"
    FROM house_metrics hm, total_houses th
  `;

  const result = await pool.query(query);
  
  return result.rows[0];
}

async getAllHousesBalanceWithCalculations(houseId?: number): Promise<HouseDto[]> {
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
  
  if (houseId) {
    query += ` AND h.id = $1`;
    params.push(houseId);
  }

  query += `
      GROUP BY h.id, h.name
    ),
    house_transactions AS (
      SELECT 
        house_id,
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

  if (houseId) {
    query += ` WHERE ht.house_id = $1`;
  }

  query += `
      GROUP BY house_id
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
    ORDER BY hb.house_name ASC
  `;

  const result = await pool.query(query, params);
  return result.rows;
}
}
