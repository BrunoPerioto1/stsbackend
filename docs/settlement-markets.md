# Liquidação por capacidades

O motor mantém a confirmação humana: `POST /settlement/compute` grava apenas em `bet_settlement_suggestions`; `POST /settlement/confirm` continua sendo o único caminho que altera `bet_results`.

## Dados e escopo

| Capacidade | Fatos aceitos | Estado |
|---|---|---|
| `SCORE_FULL_TIME` | placar de tempo normal (`normaltime`) | Suportado para resultado final, total de gols, ambas marcam, resultado correto, dupla chance, handicap simples, clean sheet e total de gols de um time |
| `SCORE_PERIODS` | primeiro/segundo tempo reconciliados com o placar final | Parcial: resultado 1T, total de gols HT, intervalo/final e gol em ambos os tempos |
| `TEAM_STATS` | uma linha por métrica e escopo, com mandante/visitante | Parcial: escanteios, cartões, chutes, chutes a gol, faltas, impedimentos e defesas |
| `INCIDENTS` | feed completo, ordenado e reconciliado com o placar | Parcial: primeiro/próximo/último gol, pênalti e cartão vermelho |
| `PLAYER_STATS` | jogador identificado, participante confirmado e métrica única | Parcial: marcar, assistência, gol ou assistência, chutes e cartões do jogador |
| `SPORT_SPECIFIC_STATS` | avaliador específico por esporte | Indefinido nesta fase; esportes que não sejam futebol retornam `ESPORTE_FORA_ESCOPO` |

O payload adicional fica em `event_facts.data_json`, com `format_version`, `fetched_at` e flags de completude. JSON inválido, duplicado, fora do escopo ou que não reconcilie com o placar resulta em `DADO_INDISPONIVEL` ou `REGRA_NAO_SUPORTADA`; nunca em zero implícito.

## Coleta

O único endpoint confirmado usado pelo job é `GET /api/v1/event/{id}`. O adaptador `jobs/sofascore/settlement_adapter.py` usa somente `normaltime`; `current` não é fallback. Coletores de estatísticas, incidentes e jogadores permanecem mockáveis até que seus endpoints sejam confirmados.

## Auditoria do CSV

Na análise fornecida há 29.950 apostas, 24.658 de futebol. O parser reconheceu 8.148 apostas de futebol após a expansão; 4.600 dependem apenas de `SCORE_FULL_TIME` e 5.753 ficam cobertas quando há parciais válidas. Esses números são potencial de reconhecimento textual, não promessa de sugestão: a aposta só recebe resultado quando todos os dados requeridos estão presentes e consistentes.

O relatório com os 100 mercados normalizados e o agrupamento por `requiredData` foi gerado em `auditoria-mercados.md` no diretório de outputs da análise.

## API de inspeção

`GET /settlement/support` expõe aliases, capacidades, confiança e estado de cada mercado. `GET /settlement/review` lista sugestões indefinidas para revisão manual.
