import { Inject, Injectable } from '@nestjs/common';
import { Kysely } from 'kysely';

import { DATABASE_READ_CONNECTION } from '../db/db.module';
import type { Database } from '../db/database.types';
import type { CandidateEvent } from '../../bet/event-matching';

// Janela de busca em volta da aposta. O job so guarda 30 dias pra frente, e
// aposta em jogo de ontem nao existe — 1 dia pra tras cobre fuso e jogo que
// ja comecou.
const DIAS_ANTES = 1;
const DIAS_DEPOIS = 30;

// A LISTA de tips quer o contrario da criacao de aposta: mostrar tambem o
// horario de jogo que ja aconteceu. O teto e' o proprio job, que apaga o evento
// 2 dias depois do apito (RETENCAO_DIAS em jobs/sofascore/collect.py) — olhar
// mais pra tras nao acha nada, porque a linha nao existe mais. Tip mais velha
// que isso fica sem horario, e so persistindo na tip pra resolver.
export const DIAS_ANTES_RETIDOS = 2;

const DIA_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class SportEventRepository {
  constructor(
    @Inject(DATABASE_READ_CONNECTION)
    private readonly dbRead: Kysely<Database>,
  ) {}

  // Traz a janela inteira (algumas centenas de linhas) e deixa a comparacao de
  // nome pro matcher em memoria. Similaridade de string em SQL exigiria
  // pg_trgm e um indice a mais pra ganhar nada nesse volume.
  //
  // Sem filtro por esporte de proposito: a extracao escreve em portugues
  // ("Futebol") e o provider grava em ingles ("Football"). Hoje o cache so tem
  // futebol; quando tiver outro esporte, aqui entra um mapa dos dois nomes.
  async findCandidates(
    referencia: Date,
    diasAntes: number = DIAS_ANTES,
  ): Promise<CandidateEvent[]> {
    const rows = await this.dbRead
      .selectFrom('sportEvents')
      .select([
        'externalId',
        'provider',
        'startAt',
        'sport',
        'homeName',
        'homeShort',
        'homeCode',
        'awayName',
        'awayShort',
        'awayCode',
      ])
      .where(
        'startAt',
        '>=',
        new Date(referencia.getTime() - diasAntes * DIA_MS),
      )
      .where(
        'startAt',
        '<=',
        new Date(referencia.getTime() + DIAS_DEPOIS * DIA_MS),
      )
      .execute();

    return rows;
  }
}
