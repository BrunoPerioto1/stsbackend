import { Injectable } from '@nestjs/common';
import { CreateCasaDto } from './create-casa.dto';
import { UpdateCasaDto } from './update-casa.dto';
import { CreateTransacaoDto } from './create-transacao.dto';
import { pool } from '../aposta/db';

export interface CasaSaldo {
  casa_id: number;
  casa_nome: string;
  casa_slug: string;
  total_apostas: number;
  total_stake: number;
  total_lucro_apostas: number;
  total_transacoes: number;
  saldo_casa: number;
  apostas_pendentes: number;
  apostas_ganhas: number;
  apostas_perdidas: number;
}

@Injectable()
export class CasaService {
  async criarCasa(createCasaDto: CreateCasaDto) {
    const { nome, slug, ativo = true } = createCasaDto;
    
    const client = await pool.connect();
    try {
      const query = `
        INSERT INTO casas_aposta (nome, slug, ativo)
        VALUES ($1, $2, $3)
        RETURNING *
      `;
      
      const result = await client.query(query, [nome, slug, ativo]);
      return result.rows[0];
    } finally {
      client.release();
    }
  }

  async listarTodasCasas() {
    const client = await pool.connect();
    try {
      const query = `
        SELECT id, nome, slug, ativo, created_at, updated_at
        FROM casas_aposta
        ORDER BY nome ASC
      `;
      
      const result = await client.query(query);
      return result.rows;
    } finally {
      client.release();
    }
  }

  async buscarCasaPorId(id: number) {
    const client = await pool.connect();
    try {
      const query = `
        SELECT id, nome, slug, ativo, created_at, updated_at
        FROM casas_aposta
        WHERE id = $1
      `;
      
      const result = await client.query(query, [id]);
      return result.rows[0];
    } finally {
      client.release();
    }
  }

  async buscarCasaPorSlug(slug: string) {
    const client = await pool.connect();
    try {
      const query = `
        SELECT id, nome, slug, ativo, created_at, updated_at
        FROM casas_aposta
        WHERE slug = $1
      `;
      
      const result = await client.query(query, [slug]);
      return result.rows[0];
    } finally {
      client.release();
    }
  }

  async atualizarCasa(id: number, updateCasaDto: UpdateCasaDto) {
    const { nome, slug, ativo } = updateCasaDto;
    
    const client = await pool.connect();
    try {
      const query = `
        UPDATE casas_aposta
        SET nome = COALESCE($1, nome),
            slug = COALESCE($2, slug),
            ativo = COALESCE($3, ativo),
            updated_at = NOW()
        WHERE id = $4
        RETURNING *
      `;
      
      const result = await client.query(query, [nome, slug, ativo, id]);
      return result.rows[0];
    } finally {
      client.release();
    }
  }

  async deletarCasa(id: number) {
    const client = await pool.connect();
    try {
      const query = `
        DELETE FROM casas_aposta
        WHERE id = $1
        RETURNING *
      `;
      
      const result = await client.query(query, [id]);
      return result.rows[0];
    } finally {
      client.release();
    }
  }

  async calcularSaldoPorCasa(casaId: number): Promise<CasaSaldo> {
    const client = await pool.connect();
    try {
      const query = `
        SELECT 
          c.id as casa_id,
          c.nome as casa_nome,
          c.slug as casa_slug,
          COUNT(a.id) as total_apostas,
          COALESCE(SUM(a.stake), 0) as total_stake,
          COALESCE(SUM(a.lucro), 0) as total_lucro_apostas,
          COALESCE(SUM(t.valor), 0) as total_transacoes,
          GREATEST(COALESCE(SUM(a.lucro), 0) + COALESCE(SUM(t.valor), 0), 0) as saldo_casa,
          COUNT(CASE WHEN ar.result_id = 9 THEN 1 END) as apostas_pendentes,
          COUNT(CASE WHEN ar.result_id = 1 THEN 1 END) as apostas_ganhas,
          COUNT(CASE WHEN ar.result_id = 2 THEN 1 END) as apostas_perdidas
        FROM casas_aposta c
        LEFT JOIN apostas a ON c.id = a.casa_id
        LEFT JOIN aposta_results ar ON a.id = ar.aposta_id
        LEFT JOIN transacoes_casa t ON c.id = t.casa_id
        WHERE c.id = $1 AND c.ativo = true
        GROUP BY c.id, c.nome, c.slug
      `;
    
      const result = await client.query(query, [casaId]);
      return result.rows[0] || null;
    } finally {
      client.release();
    }
  }

    async calcularSaldosTodasCasas(): Promise<CasaSaldo[]> {
    const client = await pool.connect();
    try {
      const query = `
        SELECT 
          c.id as casa_id,
          c.nome as casa_nome,
          c.slug as casa_slug,
          COUNT(a.id) as total_apostas,
          COALESCE(SUM(a.stake), 0) as total_stake,
          COALESCE(SUM(a.lucro), 0) as total_lucro_apostas,
          COALESCE(SUM(t.valor), 0) as total_transacoes,
          GREATEST(COALESCE(SUM(a.lucro), 0) + COALESCE(SUM(t.valor), 0), 0) as saldo_casa,
          COUNT(CASE WHEN ar.result_id = 9 THEN 1 END) as apostas_pendentes,
          COUNT(CASE WHEN ar.result_id = 1 THEN 1 END) as apostas_ganhas,
          COUNT(CASE WHEN ar.result_id = 2 THEN 1 END) as apostas_perdidas
        FROM casas_aposta c
        LEFT JOIN apostas a ON c.id = a.casa_id
        LEFT JOIN aposta_results ar ON a.id = ar.aposta_id
        LEFT JOIN transacoes_casa t ON c.id = t.casa_id
        WHERE c.ativo = true
        GROUP BY c.id, c.nome, c.slug
        ORDER BY c.nome ASC
      `;
    
      const result = await client.query(query);
      return result.rows;
    } finally {
      client.release();
    }
  }

  async resolverCasaPorTexto(texto: string): Promise<number | null> {
    // Busca por nome exato
    const casaExata = await this.buscarCasaPorSlug(texto.toLowerCase());
    if (casaExata) return casaExata.id;

    // Busca por nome similar
    const client = await pool.connect();
    try {
      const query = `
        SELECT id, nome, slug
        FROM casas_aposta
        WHERE LOWER(nome) LIKE $1 OR LOWER(slug) LIKE $1
        AND ativo = true
        LIMIT 1
      `;
      
      const result = await client.query(query, [`%${texto.toLowerCase()}%`]);
      return result.rows[0]?.id || null;
    } finally {
      client.release();
    }
  }

  async criarTransacao(createTransacaoDto: CreateTransacaoDto) {
    const { casa_id, tipo, valor, descricao } = createTransacaoDto;
    
    const client = await pool.connect();
    try {
      // Verificar se a casa existe
      const casa = await this.buscarCasaPorId(casa_id);
      if (!casa) {
        throw new Error('Casa não encontrada');
      }

      const query = `
        INSERT INTO transacoes_casa (casa_id, tipo, valor, descricao)
        VALUES ($1, $2, $3, $4)
        RETURNING *
      `;
      
      const result = await client.query(query, [casa_id, tipo, valor, descricao]);
      return result.rows[0];
    } finally {
      client.release();
    }
  }

  async listarTransacoesPorCasa(casaId: number) {
    const client = await pool.connect();
    try {
      const query = `
        SELECT id, casa_id, tipo, valor, descricao, created_at, updated_at
        FROM transacoes_casa
        WHERE casa_id = $1
        ORDER BY created_at DESC
      `;
      
      const result = await client.query(query, [casaId]);
      return result.rows;
    } finally {
      client.release();
    }
  }

  async listarTodasTransacoes() {
    const client = await pool.connect();
    try {
      const query = `
        SELECT 
          t.id, 
          t.casa_id, 
          c.nome as casa_nome,
          t.tipo, 
          t.valor, 
          t.descricao, 
          t.created_at, 
          t.updated_at
        FROM transacoes_casa t
        LEFT JOIN casas_aposta c ON t.casa_id = c.id
        ORDER BY t.created_at DESC
      `;
      
      const result = await client.query(query);
      return result.rows;
    } finally {
      client.release();
    }
  }
}