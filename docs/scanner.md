# Scanner configurável (SofaScore)

Spec aprovado e implementado em 2026-10-03; falta aplicar a migration (ver
Deploy). Incorpora a revisão de 2026-10-02: estado observável da coleta,
precedência formal, falha ao ler a configuração e testes dos dois jobs.

## Problema

Hoje, tudo o que o scanner pega está fixo no código:

- **Quais competições.** É o dict `LIGAS` em `jobs/sofascore/collect.py`: 71
  competições de 9 esportes. Liga nova pede commit e deploy. Os comentários do
  próprio dict mostram o custo: apostas que ficaram sem evento porque a copa
  argentina, o continental asiático ou o segundo torneio da Liga MX não estavam
  na lista.
- **O que buscar depois do jogo.** O `results.py` busca o placar e, em jogo de
  futebol com placar fechado, faz mais 3 GETs: `/statistics`, `/incidents` e
  `/lineups`. A única chave é `FATOS=0/1`, que vale pra tudo. Não dá pra
  desligar a escalação numa Série C que o SofaScore cobre mal, e cada GET passa
  pelo proxy pago, com 3-5s de intervalo.

## Objetivo

Uma tela `/admin/scanner` que configura, por competição ou pelo esporte
inteiro:

1. se o coletor busca os próximos jogos da competição;
2. quais dos 3 dados extras o `results.py` busca depois do jogo.

Os jobs leem essa configuração do banco a cada execução, sem precisar de deploy.
A tela também mostra o resultado da última coleta de cada competição: quantos
jogos vieram, quando, e se a coleta falhou.

## Fora de escopo

- **Achar competição nova pelo nome.** A busca da tela filtra as competições que
  já estão cadastradas. Pra descobrir o id de uma que ainda não está na tabela,
  só a busca do próprio SofaScore resolve, e a API Nest não passa pelo
  Cloudflare dele (Node toma 403, ver `event-dates.md`). O cadastro é pela URL
  colada. O catálogo local de torneios fica pra depois (ver Decisões).
- **Escolher métrica (escanteio sim, chute não).** O custo é por endpoint:
  filtrar depois do GET não economiza nada.
- **Configuração por jogo.**
- **Dados extras fora do futebol** (ver Precedência, regra 2).
- **Horário e frequência dos jobs.** Continuam no cron do Actions.
- **Editar nome ou esporte.** Pra corrigir, exclui e cadastra de novo.
- **Configuração guardada por esporte.** "Aplicar ao esporte" é uma ação em
  lote, e uma competição cadastrada depois entra com tudo ligado.

## Dados

Migration `20261002_scanner_tournaments.sql`:

```sql
CREATE TABLE scanner_tournaments (
  id                INT PRIMARY KEY CHECK (id > 0), -- unique-tournament do SofaScore
  name              VARCHAR(100) NOT NULL,
  sport_id          INT NOT NULL REFERENCES sports(id),
  is_active         BOOLEAN NOT NULL DEFAULT true,  -- collect.py busca próximos jogos
  statistics        BOOLEAN NOT NULL DEFAULT true,  -- results.py: /statistics
  incidents         BOOLEAN NOT NULL DEFAULT true,  -- results.py: /incidents
  lineups           BOOLEAN NOT NULL DEFAULT true,  -- results.py: /lineups
  -- escritos só pelo collect.py
  last_events       INT,        -- jogos nos próximos 30 dias, na última coleta ok
  last_events_at    TIMESTAMP,  -- quando last_events foi obtido
  last_check_at     TIMESTAMP,  -- última tentativa, deu certo ou não
  last_check_status VARCHAR(16)
    CHECK (last_check_status IN ('ok', 'invalid_id', 'blocked', 'error')),
  -- escritos só pela API
  created_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE scanner_tournaments ENABLE ROW LEVEL SECURITY;
```

- **Carga inicial.** São as 71 competições de `LIGAS`. O esporte é resolvido
  pelo nome, com `(SELECT id FROM sports WHERE name = 'Futebol')`, e nunca por
  id fixo, porque o id pode mudar entre bancos. `sports.name` é UNIQUE e é a
  chave que a migration de esportes usa. Se um nome não tiver correspondência,
  vira NULL, viola o NOT NULL e derruba a migration inteira, então não existe
  carga parcial. Os comentários históricos do dict viram comentário SQL, e
  `LIGAS` sai do código.
- **`sport_id`** serve só à tela, pra agrupar e aplicar em lote. O esporte
  gravado em `sport_events` continua vindo do payload.
- **Padrão.** Com tudo ligado por padrão, o comportamento continua igual ao de
  hoje.
- **`updated_at`** só muda por ação na tela. Quem grava é a API, e não há
  trigger. O coletor escreve as colunas `last_*` a cada execução, e com trigger
  o `updated_at` passaria a responder "quando o coletor rodou", em vez de
  "quando alguém mexeu nisso".
- **Timestamps** são `TIMESTAMP`, sem fuso, como no resto do schema.
- **RLS.** O RLS fica ligado sem nenhuma política. O Supabase expõe o schema
  `public` pelo PostgREST, e isso fecha a tabela pra `anon` e `authenticated`. A
  API e os jobs conectam com o dono da tabela, que não passa pelo RLS. Ver
  também o "Achado à parte".

## Precedência no `results.py`

Pra cada jogo, decide quais dos 3 GETs extras fazer. Vale a primeira regra que
se aplica:

1. **`FATOS=0`:** nenhum.
2. **Placar não fechou como tempo normal de futebol**
   (`score_scope != 'REGULATION'`, que cobre outro esporte, jogo adiado e jogo
   cancelado): nenhum. Já é assim hoje, e é o que garante que as flags nunca
   geram request fora do futebol.
3. **Configuração indisponível** (o SELECT falhou): os 3. É o fail-safe: gastar
   alguns requests é melhor que deixar uma aposta sem dado.
4. **Competição cadastrada**, achada por `event.tournament.uniqueTournament.id`:
   as flags da linha. `is_active` não entra aqui. Pausar só para a busca de
   próximos jogos, e as apostas já casadas continuam recebendo dados.
5. **Competição não cadastrada** (aposta antiga, competição excluída): os 3.

## Jobs

**`collect.py`**

- **Leitura da configuração.** Lê
  `SELECT id, name FROM scanner_tournaments WHERE is_active`.
  - Se o SELECT falhar, o job falha (exit 1), sem fingir que não há nada ativo.
  - Se nenhuma competição estiver ativa, loga e sai com 0.
- **`fetch` passa a dizer por que falhou.** Hoje ele devolve `None` tanto pra 404
  quanto pra falha, e um 500 na `/seasons` passaria por "sem temporada". Fica
  assim:
  - 404 continua devolvendo `None`;
  - esgotar as tentativas em 403, 429, 503 ou erro de rede levanta bloqueio;
  - qualquer outro status HTTP, ou payload inesperado, levanta erro.
- **Estado por competição.** É gravado no fim de toda execução, inclusive quando
  a coleta vem vazia:

  | Situação | `last_events` e `last_events_at` | `last_check_status` | `last_check_at` |
  |---|---|---|---|
  | respondeu, com n ≥ 0 jogos na janela (`events/next` com 404 = 0 jogos) | n, agora | `ok` | agora |
  | `/seasons` com 404, ou sem temporada | mantém | `invalid_id` | agora |
  | 403, 429, 503 ou rede, com as tentativas esgotadas | mantém | `blocked` | agora |
  | qualquer outro erro | mantém | `error` | agora |

  Só o `ok` mexe no número. Se uma página falhar depois de outras darem certo,
  conta como falha da competição, e o número parcial não é gravado.
- **`sport_events` não muda.** Coleta vazia continua sem gravar nem apagar nada.
- **Exit code.** O job sai com 1 quando nenhum jogo veio e alguma competição não
  terminou `ok`. Se todas terminarem `ok` com 0 jogos (só competições fora de
  temporada ativas), sai com 0.

**`results.py`**

- Lê a configuração uma vez por execução. Se a leitura falhar, loga, faz
  rollback na conexão e segue com os 3 ligados (regra 3).
- O `SofascoreFactsCollector.collect` recebe um `FactsConfig`, uma dataclass com
  3 booleanos, e não uma lista de strings: um typo vira erro, não um GET pulado
  em silêncio.
- **Desligar Lances é seguro, mas tem efeitos.** Sem o feed de incidentes não há
  como descontar gol contra, então a escalação de jogo com gol contra é
  recusada: a aposta fica sem proposta e nunca é liquidada errado. Os pontos de
  cartão (`cardPoints`) também somem, porque vêm dos lances.

## API

Fica no `AdminController`, que já tem `AuthGuard('jwt')` e `AdminGuard` na
classe. A escrita vai num `ScannerRepository` novo, porque o `AdminRepository` é
só leitura por desenho. Toda escrita da API grava
`updated_at = CURRENT_TIMESTAMP`.

| Método | Rota | Corpo | Resposta |
|---|---|---|---|
| GET | `/admin/scanner` | — | lista com `sportName`, ordenada por esporte e nome |
| POST | `/admin/scanner` | `{ id, name, sportId }` | linha criada; 400 se o id já existe ou o esporte não existe |
| PATCH | `/admin/scanner/:id` | `{ isActive?, statistics?, incidents?, lineups? }` | linha; 400 se o corpo vier vazio, 404 se não existe |
| PATCH | `/admin/scanner/sports/:sportId` | mesmas flags | linhas alteradas; 400 se vazio, 404 se o esporte não tem competição |
| DELETE | `/admin/scanner/:id` | — | 204; 404 se não existe |

- O `id > 0` é validado no DTO e de novo no banco, pelo CHECK.
- O lote devolve a lista de linhas alteradas: o front mescla no cache, e a
  contagem é o tamanho da lista.
- O 404 do lote cobre de uma vez esporte inexistente e esporte sem competição,
  sem uma consulta extra.

## Tela

Rota `/admin/scanner`, com o item **Scanner** no menu Administração. Usa a
moldura `AdminPanel`, como as telas de Casas e Usuários.

```
Scanner SofaScore                        [buscar nome ou id]  [+ Competição]
[Todos 71] [Futebol 46] [Tênis 8] [eSports 6] [Basquete 4] ...

                           Próx. 30 dias          Coleta  Estatíst.  Lances  Jogadores
FUTEBOL · 46                                        [x]      [-]       [ ]      [-]
  Premier League #17       24 jogos                 [x]      [x]       [ ]      [x]   ✕
  Copa Argentina #1024     ID inválido              [x]      [ ]       [ ]      [ ]   ✕
  Série C #1281            6 jogos · coleta falhou  [x]      [x]       [ ]      [ ]   ✕
TÊNIS · 8                                           [-]    só placar
  Wimbledon, Men #2361     pausada · última: 0      [ ]    só placar                  ✕
```

**Coluna "Próximos 30 dias"**

| Estado | Texto |
|---|---|
| pausada | `pausada · última: 6 jogos` (sem número: `pausada`) |
| nunca coletada | `aguardando coleta` |
| `ok` | `24 jogos`. O `0 jogos` fica sem cor, porque fora de temporada é normal |
| `invalid_id` | `ID inválido`, em alerta |
| `blocked` ou `error` | `24 jogos · coleta falhou`, em alerta. A dica mostra a data da última coleta válida e o tipo de falha |
| ativa, com última tentativa há mais de 5 dias | acrescenta `· desatualizado`, em alerta. O coletor roda seg e qui, então o maior intervalo normal é de 4 dias |

**Lote por esporte**

- Cada coluna tem o seu checkbox na linha do grupo, com estado próprio:
  marcado, desmarcado ou indeterminado.
- A dica e o toast deixam claro que é uma ação sobre o que existe hoje, e não
  uma configuração do esporte: "Aplicar às 46 competições de Futebol".

**Edição**

- O clique muda o checkbox na hora (mutation otimista). Se a API falhar, ele
  volta ao estado anterior e aparece um toast. No lote, todas as linhas do grupo
  mudam juntas.
- Fora do futebol, as 3 colunas de dados viram "só placar".

**Cadastro**

- Um campo único aceita o id ou a URL colada. A tela usa o último segmento
  numérico do path e ignora hash e query:
  - `17` vira 17;
  - `…/premier-league/17` vira 17;
  - `…/premier-league/17#id:61627` vira 17 (o número depois de `#id:` é a
    temporada e não serve);
  - `…/premier-league/17?tab=x` vira 17;
  - qualquer outra coisa dá erro na hora, sem chamar a API.
- O nome vem sugerido a partir do slug (`premier-league` vira "Premier League").
- O esporte é escolhido na lista de `/bets/sports`.

**Exclusão**

- A confirmação diz o efeito: "Excluir remove a configuração. Apostas
  pendentes em jogos desta competição voltam a buscar todos os dados."
- Pra só parar de coletar, basta desmarcar Coleta.

**Celular:** as colunas viram checkboxes com rótulo, lado a lado.

## Arquivos

Backend (`stsbackend`):

- novos: `src/infra/db/migrations/20261002_scanner_tournaments.sql`,
  `src/db_types/ScannerTournaments.ts`,
  `src/infra/repository/scanner.repository.ts`,
  `src/admin/scanner.service.ts` (e `.spec.ts`; serviço próprio pra não mexer
  no construtor do `AdminService`), `jobs/sofascore/test_jobs.py`
- alterados: `src/infra/db/database.types.ts`, `src/admin/admin.controller.ts`,
  `src/admin/dto/admin.dto.ts`, `src/module/admin.module.ts`
- jobs: `jobs/sofascore/collect.py`, `results.py`, `settlement_adapter.py`,
  `test_settlement_adapter.py`
- docs: a seção Coleta do `event-dates.md` passa a apontar pra tabela

Front (`sts`):

- novos: `src/components/admin/AdminScanner.tsx`,
  `src/pages/AdminScannerPage.tsx`, `src/lib/scanner.ts` (parser da URL e texto
  da coluna "Próximos 30 dias", testados em `tests/scanner.test.mjs`)
- alterados: `src/api/routes/get-admin.ts`, `src/hooks/queries/use-admin.ts`,
  `src/App.tsx` (rota), `src/components/layout/AppSidebar.tsx` (menu)

## Deploy

1. Rodar `npm run db:migrate`.
2. Conferir que `SELECT count(*) FROM scanner_tournaments` dá 71.
3. Só então fazer o push do backend (API e jobs). O `results.py` roda 3x por
   dia: se ler a tabela antes dela existir, cai no fail-safe (regra 3), mas o
   `collect.py` falharia.
4. Push do front.

## Verificação

**Python.** O CI já roda `unittest discover` em `jobs/sofascore`, então os
testes novos entram nele sem mudar o workflow.

- Coletor de fatos (`test_settlement_adapter.py`):
  - as 8 combinações de flags, cada uma fazendo exatamente os GETs ligados;
  - Lances desligado com gol contra: a escalação é recusada;
  - Lances desligado: sem `cardPoints`.
- `results.py` (`test_jobs.py`):
  - competição não cadastrada busca tudo;
  - configuração indisponível busca tudo e faz rollback;
  - `FATOS=0` já é coberto pelo teste existente do `UnverifiedFactsCollector`.
- `collect.py` (`test_jobs.py`):
  - nenhuma competição ativa sai com 0;
  - resposta válida com 0 jogos dá `ok` com 0;
  - `/seasons` com 404 dá `invalid_id`;
  - bloqueio dá `blocked`, sem número;
  - página que falha depois de outra dar certo não grava o número parcial;
  - sucesso dá `ok` com o número.

**Backend.** Typecheck, lint e jest, com teste do serviço pra PATCH vazio (400)
nas duas rotas e pro lote sem linhas (404).

**Front.** Build e lint.

**Ponta a ponta.** Pelo "Run workflow" do Actions, porque o Windows bloqueou o
`wreq` local:

- deixar uma competição com id errado e conferir `ID inválido` na tela;
- rodar o `results.py` com `MAX_EVENTOS=10` e Jogadores desligado numa
  competição, e conferir no log que o GET de `/lineups` sumiu.

## Decisões

1. **Flags por competição, com o esporte como ação em lote:** aprovado.
2. **Excluir, com confirmação, além de pausar:** aprovado.
3. **Catálogo local pra buscar competição nova pelo nome:** fica pra depois. Ele
   seria um job semanal baixando a lista de torneios do SofaScore numa tabela.
   Custaria uma tabela, um passo novo no workflow e 1 request por categoria via
   proxy (só o futebol tem centenas de países), e os endpoints
   (`/sport/{esporte}/categories` e `/category/{id}/unique-tournaments`) ainda
   precisariam ser conferidos. A URL colada já resolve o cadastro.

## Achado à parte (fora deste spec)

Nenhuma tabela do banco tem RLS. O front não usa o Supabase direto (só
`VITE_API_URL`), então a chave `anon` não vai pro navegador, e o risco hoje
depende de ela vazar. Mas, com a Data API do Supabase ligada (o padrão), quem
tiver a chave lê e escreve `users` (com hash de senha) e `bets` pelo PostgREST.
Vale uma migration própria ligando RLS em todas as tabelas de `public`.
