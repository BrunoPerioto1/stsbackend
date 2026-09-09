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
  async findCandidates(referencia: Date): Promise<CandidateEvent[]> {
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
        new Date(referencia.getTime() - DIAS_ANTES * DIA_MS),
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
