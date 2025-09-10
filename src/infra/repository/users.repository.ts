
import { Injectable } from '@nestjs/common';
import { UserDto } from '../../users/dto/user.dto';
import { Pool } from 'pg';

@Injectable()
export class UsersRepository {
  constructor(private readonly pool: Pool) {}

  async findByEmail(email: string): Promise<UserDto | null> {
    const query = `SELECT * FROM public.users WHERE email = $1 LIMIT 1`;
    const result = await this.pool.query<UserDto>(query, [email]);
    return result.rows[0] ?? null;
  }

  async findByUsername(username: string): Promise<UserDto | null> {
    const query = `SELECT * FROM public.users WHERE username = $1 LIMIT 1`;
    const result = await this.pool.query<UserDto>(query, [username]);
    return result.rows[0] ?? null;
  }

  async findById(id: number): Promise<UserDto | null> {
    const query = `SELECT * FROM public.users WHERE id = $1 LIMIT 1`;
    const result = await this.pool.query<UserDto>(query, [id]);
    return result.rows[0] ?? null;
  }

    async vincularTelegram(userId: number, telegramUserId: number): Promise<void> {
    await this.pool.query(
      'UPDATE public.users SET telegram_user_id = $1 WHERE id = $2',
      [telegramUserId, userId]
    );
  }



  async insertUser(params: {
    username: string;
    email: string;
    password_hash: string;
    role_id: number;
    full_name?: string | null;
  }): Promise<UserDto> {
    const query = `
      INSERT INTO public.users (username, email, password_hash, role_id, full_name)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `;
    const result = await this.pool.query<UserDto>(query, [
      params.username,
      params.email,
      params.password_hash,
      params.role_id,
      params.full_name ?? null,
    ]);
    return result.rows[0];
  }

  async updateUser(
    id: number,
    fields: Partial<
      Pick<
        UserDto,
        'username' | 'email' | 'full_name' | 'is_active' | 'role_id' | 'password_hash'
      >
    >,
  ): Promise<UserDto | null> {
    const keys = Object.keys(fields);
    if (keys.length === 0) return this.findById(id);

    const setFragments: string[] = [];
    const values: any[] = [];

    keys.forEach((key, index) => {
      setFragments.push(`${key} = $${index + 1}`);
      // @ts-ignore confiando que as chaves existem no banco
      values.push((fields as any)[key]);
    });

    const query = `UPDATE public.users SET ${setFragments.join(', ')} WHERE id = $${
      keys.length + 1
    } RETURNING *`;
    values.push(id);

    const result = await this.pool.query<UserDto>(query, values);
    return result.rows[0] ?? null;
  }

  async setLastLogin(id: number): Promise<void> {
    const query = `UPDATE public.users SET last_login = NOW() WHERE id = $1`;
    await this.pool.query(query, [id]);
  }
}
