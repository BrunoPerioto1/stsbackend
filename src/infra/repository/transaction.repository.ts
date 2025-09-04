import { Injectable, NotFoundException } from '@nestjs/common';
import { pool } from '../db/db'; 
import camelcaseKeys from 'camelcase-keys';
import { NewTransactionDto, TransactionDto,  } from 'src/transactions/dto/transaction.dto';
import { TransactionFilterDto } from 'src/transactions/dto/transaction.filter.dto';



@Injectable()
export class TransactionRepository {
    async create(transactionData: NewTransactionDto): Promise<{ id: number }> {
        const query = `
            INSERT INTO house_transactions (house_id, transaction_type_id, value)
            VALUES ($1, $2, $3)
            RETURNING id
        `;
        const params = [
            transactionData.houseId,
            transactionData.transactionTypeId,
            transactionData.value,
        ];
        const result = await pool.query(query, params);
        return { id: result.rows[0].id };
    }

async findAllTransactions(filter?: TransactionFilterDto): Promise<TransactionDto[]> {
    let query = `
        SELECT 
        ht.id, 
        ht.house_id, 
        h.name as house_name,
        tt.name as transaction_type,
        ht.value, 
        ht.created_at
      FROM house_transactions ht
      LEFT JOIN betting_houses h ON ht.house_id = h.id
      LEFT JOIN transaction_types tt ON ht.transaction_type_id = tt.id
    `;
    const params: any[] = [];
    const conditions: string[] = [];
    if (filter) {
      if (filter.houseId) {
        conditions.push(`ht.house_id = $${params.length + 1}`);
        params.push(filter.houseId);
      }
      if (filter.startDate) {
        conditions.push(`ht.created_at >= $${params.length + 1}`);
        params.push(filter.startDate);
      }
      if (filter.endDate) {
        conditions.push(`ht.created_at <= $${params.length + 1}`);
        params.push(filter.endDate);
      }
    }
    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }
    query += ' ORDER BY ht.created_at DESC';
    const result = await pool.query(query, params);
    return result.rows;
  }

  async findAllTypeTransactions(): Promise<{ id: number, name: string }[]> {
    const query = `
      SELECT id, name
      FROM transaction_types
      ORDER BY name
    `;
    const result = await pool.query(query);
    return result.rows;
  }
}