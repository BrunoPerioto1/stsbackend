import { sql } from 'kysely';

/**
 * A data que manda numa aposta: o inicio real do jogo quando o evento foi
 * identificado, senao a hora em que a aposta foi planilhada.
 *
 * Filtro de periodo, ordenacao e agrupamento por dia/mes usam esta expressao —
 * nunca `b.betTime` cru. Uma aposta feita dia 01/09 num jogo do dia 03/09 conta
 * no dia 03/09; aposta sem evento identificado (esporte fora da coleta, nome
 * que nao casou, aposta antiga) cai no `betTime` e se comporta como sempre.
 *
 * A referencia tem que sair de `sql.ref`: dentro de um fragmento cru o
 * CamelCasePlugin nao atua e o Postgres rebaixaria `b.eventStartAt` pra
 * `b.eventstartat`, que nao existe.
 *
 * Exige que a tabela `bets` esteja com o alias `b` na query.
 */
export const betDate = sql<Date>`coalesce(${sql.ref('b.eventStartAt')}, ${sql.ref('b.betTime')})`;
