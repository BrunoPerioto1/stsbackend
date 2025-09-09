import { Injectable } from '@nestjs/common';
import { DatabaseService } from '@/infra/db/db.service';

export type UserRecord = {
  id: number;
  username: string;
  email: string;
  password_hash: string;
  full_name: string | null;
  is_active: boolean | null;
  role_id: number;
  created_at: Date | null;
  updated_at: Date | null;
  last_login: Date | null;
};

@Injectable()
export class UsersRepository {
  constructor(private readonly db: DatabaseService) {}

  async findByEmail(email: string): Promise<UserRecord | null> {
    const sql = `select * from public.users where email = $1 limit 1`;
    return await this.db.queryOne(sql, [email]);
  }

  async findByUsername(username: string): Promise<UserRecord | null> {
    const sql = `select * from public.users where username = $1 limit 1`;
    return await this.db.queryOne(sql, [username]);
  }

  async findById(id: number): Promise<UserRecord | null> {
    const sql = `select * from public.users where id = $1 limit 1`;
    return await this.db.queryOne(sql, [id]);
  }

  async insertUser(params: {
    username: string;
    email: string;
    password_hash: string;
    role_id: number;
    full_name?: string | null;
  }): Promise<UserRecord> {
    const sql = `
      insert into public.users (username, email, password_hash, role_id, full_name)
      values ($1, $2, $3, $4, $5)
      returning *
    `;
    return await this.db.queryOne(sql, [
      params.username,
      params.email,
      params.password_hash,
      params.role_id,
      params.full_name ?? null,
    ]);
  }

  async updateUser(id: number, fields: Partial<Pick<UserRecord, 'username' | 'email' | 'full_name' | 'is_active' | 'role_id' | 'password_hash'>>): Promise<UserRecord | null> {
    const keys = Object.keys(fields);
    if (keys.length === 0) return this.findById(id);

    const setFragments: string[] = [];
    const values: any[] = [];

    keys.forEach((key, index) => {
      setFragments.push(`${key} = $${index + 1}`);
      // @ts-ignore trusting keys are valid columns
      values.push((fields as any)[key]);
    });

    // updated_at will be set by trigger per DDL
    const sql = `update public.users set ${setFragments.join(', ')} where id = $${keys.length + 1} returning *`;
    values.push(id);
    return await this.db.queryOne(sql, values);
  }

  async setLastLogin(id: number): Promise<void> {
    const sql = `update public.users set last_login = now() where id = $1`;
    await this.db.execute(sql, [id]);
  }
}


