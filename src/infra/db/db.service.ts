import { Injectable } from '@nestjs/common';
import { pool } from './db';

@Injectable()
export class DatabaseService {
  async query(text: string, params?: any[]): Promise<any[]> {
    const client = await pool.connect();
    try {
      const result = await client.query(text, params);
      return result.rows;
    } finally {
      client.release();
    }
  }

  async queryOne(text: string, params?: any[]): Promise<any> {
    const rows = await this.query(text, params);
    return rows[0] || null;
  }

  async execute(text: string, params?: any[]): Promise<void> {
    const client = await pool.connect();
    try {
      await client.query(text, params);
    } finally {
      client.release();
    }
  }
}
