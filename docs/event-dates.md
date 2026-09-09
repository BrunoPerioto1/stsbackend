# Data do evento vs data da aposta

`bet_time` é quando a aposta foi criada. Não é quando o jogo acontece. Uma
aposta feita dia 01/09 num jogo do dia 03/09 era agrupada como 01/09 e não
havia onde guardar o 03/09.

`event_start_at` passa a guardar o início real do evento. `bet_time` não muda
de significado nem de uso: **dashboard, filtros e agrupamento continuam em
`bet_time`**. Nada retroativo — aposta antiga fica com `event_start_at` nulo.

## Fluxo

```
job diario (GitHub Actions)  ->  sport_events        [assincrono, fora do request]
criacao da aposta            ->  matching local      [1 query, zero rede externa]
```

O matching acontece na criação, contra o cache já no Postgres. Nenhuma chamada
ao provider no caminho do usuário: rate limit externo não afeta o Telegram nem
a API, e provider fora do ar não impede planilhar.

## Por que o coletor é Python e roda fora do Vercel

O que passa pelo Cloudflare do SofaScore é o fingerprint TLS/JA3 do `wreq`
(binding do crate Rust). `axios`/`fetch` tomam 403 — não existe equivalente em
JS. Além disso o plano Hobby do Vercel tem teto de 60s por função e 1 cron por
dia, e o coletor precisa de delay de 3-5s entre requests pra não ser bloqueado.

Por isso a camada de provider **não é uma interface no Nest**. A fronteira é a
tabela `sport_events` com a coluna `provider`: o job escreve, a API só lê.
Trocar de fonte é trocar `jobs/sofascore/collect.py`, sem tocar no backend.

## Coleta

24 competições, IDs verificados via `/search/all` do próprio SofaScore. Por
competição são 2 requests (`/seasons` + `/events/next/0`), janela de 30 dias —
uma página traz 30 jogos, ~3 rodadas. Total ~48 requests, ~3min, 1x por dia.

Coleta por competição e não por time: por time eram 22 requests por liga e cada
confronto vinha duplicado (aparecia na lista dos dois times).

O job também:

- corrige `bets.event_start_at` quando um jogo é adiado ou antecipado;
- apaga evento com mais de 2 dias (a aposta guarda a própria cópia da data);
- não grava nada se a coleta vier vazia — bloqueio não pode zerar o cache bom.

## Matching (`src/bet/event-matching.ts`)

Sem IA. Função pura, sem I/O. Regras nesta ordem:

1. chave normalizada idêntica → `1.00`
2. contenção de tokens (`nottingham` ⊂ `nottingham forest`) → `0.95`
3. token exclusivo → `0.90`
4. similaridade de Levenshtein ≥ `0.80`

Token exclusivo é o que resolve nome longo que não bate por nenhuma das outras
regras. A casa escreve `Operário Ferroviário`, o provider grava `Operário-PR`:
não há contenção e o Levenshtein dá 0.50, mas o token `operario` pertence a um
único time em toda a janela coletada, então identifica sozinho. Token
compartilhado (`botafogo` em três times, `atletico`, `inter`) não ganha esse
peso e continua caindo no desempate normal.

Normalização tira acento, pontuação e sufixo de clube (`FC`, `SC`, `de`, `do`).
Pontua contra `name`, `shortName` e `nameCode` — os apelidos que o próprio
SofaScore mantém (`Manchester City` / `Man City` / `MCI`), o que dispensa
tabela de alias pra maioria dos nomes. `ALIASES` cobre só o que o provider não
tem: nome em português de clube estrangeiro (`Inter de Milão`, `Nápoles`).

**Os dois times precisam casar** — é o que separa `Botafogo-PB` de
`Botafogo-SP`. Se o segundo colocado fica a menos de `0.03` do primeiro, os dois
são plausíveis e o match é descartado.

Múltipla: cada confronto é casado separadamente. Se algum não casar, a múltipla
inteira fica sem data. A data é a do jogo mais cedo, a confiança é a menor das
partes. `foldMultiEventGame` produz dois formatos de mercado e os dois são
tratados — com a seleção prefixando cada confronto (`A vs B - vitória / C vs D -
vitória`) e com a lista de confrontos seguida da seleção depois de ` · `
(`A x B / C x D · A e C vencem - Resultado final`).

Sem match confiável: grava `null` nos quatro campos. **Nunca inventa data e
nunca bloqueia a criação da aposta** — qualquer erro no matching é engolido.

Calibrado contra 543 eventos reais das 24 competições: 26/26 nos formatos de
nome que as casas de aposta usam, sem nenhum falso positivo nos casos
adversariais (`Botafogo-PB x Botafogo-SP`, `Athletic Club x Athletico`).

Custo medido contra os 543 candidatos: **~23ms de CPU** por aposta, mais a query
no Postgres. O mesmo `createBet` já espera 1-3s de Groq/OpenAI.

## Antes de subir

Aplicar o bloco `=== Event dates ===` de `src/infra/db/schema.sql` (SQL
idempotente, como o resto do projeto) e cadastrar o secret `DATABASE_URL` no
repositório do GitHub. O SQL foi preparado, não executado.

O primeiro job precisa rodar antes de qualquer aposta casar — com a tabela
vazia todo match retorna `null`, sem erro.
