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

O job `jobs/sofascore/results.py` lê quatro endpoints por evento, um por capacidade:

| Endpoint | Alimenta | Normalizador |
|---|---|---|
| `GET /api/v1/event/{id}` | placar e tempos | `normalize_event` |
| `GET /api/v1/event/{id}/statistics` | `teamStats` | `normalize_statistics` |
| `GET /api/v1/event/{id}/incidents` | `incidents` | `normalize_incidents` |
| `GET /api/v1/event/{id}/lineups` | `playerStats` | `normalize_lineups` |

O placar usa somente `normaltime`; `current` não é fallback. Os três extras custam 3 requests a mais por evento e são desligáveis com `FATOS=0`, que volta ao comportamento de só placar. As chaves de cada payload (`cornerKicks`, `onTargetScoringAttempt`, …) estão mapeadas explicitamente em `settlement_adapter.py`: chave que não está no mapa é ignorada, nunca adivinhada — errar a chave deixa o mercado sem proposta, não liquida errado. Uma conferência contra resposta real do provider ainda é necessária antes de confiar nos números em produção.

No fim de cada rodada o job lista o que não reconheceu (`campos do provider fora do mapa: expectedGoals, bigChances`). É por ali que se descobre um campo renomeado, em vez de investigar por que um mercado parou de liquidar.

`normalize_lineups` é o único ponto onde ausência significa zero — e portanto o único onde chave errada liquidaria errado (todo jogador com 0 assistência num snapshot "completo" transformaria "jogador dar assistência" em aposta perdida). Duas travas: se nenhuma das chaves mapeadas aparecer no jogo inteiro, o snapshot é recusado; e a soma dos gols dos jogadores precisa bater com o placar. Jogo com gol contra não fecha essa conta e fica sem liquidação de mercado de jogador — perder um jogo é barato, liquidar errado não é.

Três garantias que o normalizador mantém: valor não inteiro (`"55%"`, `"12/20 (60%)"`) não vira número; métrica duplicada com valores divergentes é descartada inteira em vez de escolher uma; e gol de prorrogação fica fora do escopo `REGULATION`, que é o placar de 90 minutos que temos. Cada gol entra duas vezes, com escopo `REGULATION` e com o tempo em que aconteceu, porque o avaliador filtra por escopo exato.

`src/settlement/facts-contract.spec.ts` roda o motor em cima da saída literal do coletor (`src/settlement/__fixtures__/sofascore-facts.json`): é o que trava o contrato entre os dois lados.

## Auditoria do CSV

Na análise fornecida há 29.950 apostas, 24.658 de futebol. O parser reconheceu 8.148 apostas de futebol após a expansão; 4.600 dependem apenas de `SCORE_FULL_TIME` e 5.753 ficam cobertas quando há parciais válidas. Esses números são potencial de reconhecimento textual, não promessa de sugestão: a aposta só recebe resultado quando todos os dados requeridos estão presentes e consistentes.

O relatório com os 100 mercados normalizados e o agrupamento por `requiredData` foi gerado em `auditoria-mercados.md` no diretório de outputs da análise.

## Texto cortado pelo canal

O canal de tips corta a linha do mercado em 100 caracteres antes de a mensagem chegar — conferido contra `tips.text`, onde a linha termina em "Handicap de escan" e a odd vem logo abaixo. Em 2026-09-15 eram 697 apostas com `market` de exatamente 100 caracteres, de todas as origens (importação antiga, Telegram e app manual, que copia da tip). A coluna aceita 255: o corte não é do banco nem do código.

Por isso `parseMarket` recusa, com `MERCADO_TRUNCADO`, todo texto com exatamente `LIMITE_DO_CANAL` (100) code points. Quando o corte cai na fronteira entre duas pernas, uma múltipla de 3 vira uma de 2 perfeitamente válida e seria proposta como ganha sem a perna que faltou — a aposta 12063 é exatamente isso. `canal-real.spec.ts` trava a regra com esse texto real.

## Rótulos de jogador

Além dos rótulos originais, o parser aceita a escrita do canal: `Marcar em qualquer momento`, `Marcar gol ou dar assistência`, `Chutes a gol`/`ao gol`/`no gol` sem "do jogador" (`Clay Holstad 1+ - Chutes a gol`) e o verbo grudado no nome (`Vitor Roque marca - Jogador para marcar`). Como "Chutes a gol" também é rótulo de mercado de time, participante que resolve para um dos times do confronto é recusado pelo parser de jogador. Nome ambíguo continua sem proposta: "Pedro" com Pedro Guilherme e Pedro Milans em campo não é adivinhado.

## API de inspeção

`GET /settlement/support` expõe aliases, capacidades, confiança e estado de cada mercado. `GET /settlement/review` lista sugestões indefinidas para revisão manual.
