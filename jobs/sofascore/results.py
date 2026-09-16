"""Busca o placar dos jogos que ja' terminaram e alimenta event_results.

    DATABASE_URL=postgres://... python results.py

Roda depois dos jogos (varias vezes ao dia). Companheiro do collect.py: aquele
traz os jogos que VAO acontecer, este traz o placar dos que JA' aconteceram.

Por que e' barato: a aposta ja' guarda `event_external_id` — o matching de time
foi feito na criacao dela, por src/bet/event-matching.ts. Aqui e' um GET por
evento, sem paginar liga nenhuma. Isso tambem tira o limite de competicoes:
funciona pra Libertadores, Conference League ou qualquer torneio que o usuario
tenha apostado, nao so' pras ligas listadas no collect.py.

ENDPOINTS
    GET /api/v1/event/{id}             ->  {"event": {... homeScore, awayScore, status}}
    GET /api/v1/event/{id}/statistics  ->  escanteios, chutes, faltas, cartoes
    GET /api/v1/event/{id}/incidents   ->  gols em ordem, penaltis, vermelhos
    GET /api/v1/event/{id}/lineups     ->  gols/assistencias/chutes por jogador

O primeiro foi verificado contra api.sofascore.com em 2026-09-09. Os tres
extras alimentam os mercados de estatistica (escanteio, chute, assistencia) e
custam 3 GETs a mais por evento — desligue com FATOS=0 se bater rate limit. As
chaves de cada payload estao mapeadas em settlement_adapter.py e precisam de
uma rodada de conferencia contra resposta real: chave errada nao liquida
errado, so' deixa o mercado sem proposta.

Passa pelo Cloudflare pelo fingerprint TLS do wreq, mesma dependencia do
collect.py.

PLACAR: usamos somente `normaltime` (90min), sem fallback para `current`. Mercado de
futebol liquida em tempo normal; `current` inclui prorrogacao e daria resultado
errado em mata-mata.
"""

from __future__ import annotations

import asyncio
import os
import random
import sys
import time
from pathlib import Path
from typing import Any

import psycopg
from wreq import Client, Emulation, Proxy
from psycopg.types.json import Jsonb
from settlement_adapter import SofascoreFactsCollector, UnverifiedFactsCollector, normalize_event

# ---------------- config ----------------
EMULATION = "Chrome149"
HOSTS = [
    "https://api.sofascore.com/api/v1",
    "https://www.sofascore.com/api/v1",
]
DELAY_MIN, DELAY_MAX = 3.0, 5.0
RETRIES = 3
PROVIDER = "sofascore"

# Margem depois do apito pra so' buscar jogo que realmente acabou. 90min de
# jogo + intervalo + acrescimos + folga do provider pra fechar a sumula.
ATRASO_MINIMO_HORAS = 3
# Jogo velho demais nao volta a ser tentado: se nao finalizou ate' agora, foi
# cancelado ou o provider perdeu, e o usuario resolve na mao.
JANELA_MAXIMA_DIAS = 30
# Teto do lote. MAX_EVENTOS=10 faz uma rodada curta de conferencia sem
# esperar o lote inteiro — util depois de mexer no mapa de chaves.
MAX_EVENTOS_POR_RODADA = int((os.environ.get("MAX_EVENTOS") or "300").strip())
# Estatisticas/incidentes/escalacao: 3 GETs a mais por evento. FATOS=0 volta ao
# comportamento antigo (so placar) sem mexer em codigo, se o provider apertar.
COLETA_FATOS = (os.environ.get("FATOS") or "1").strip() != "0"

HEADERS = {
    "Accept": "*/*",
    "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
    "Origin": "https://www.sofascore.com",
    "Referer": "https://www.sofascore.com/",
}

STATUS_FINAL = {"finished", "canceled", "postponed"}

requests_feitos = 0
erros: list[str] = []


def log(msg: str) -> None:
    print(f"[{time.strftime('%H:%M:%S')}] {msg}", flush=True)


def _status(resp: Any) -> int:
    s = getattr(resp, "status", None)
    if s is None:
        s = getattr(resp, "status_code", None)
    for tentar in (lambda: int(s), lambda: s.as_int(), lambda: int(s.value)):
        try:
            return tentar()
        except Exception:  # noqa: BLE001
            continue
    raise RuntimeError(f"status ilegivel: {s!r}")


def novo_client() -> Client:
    """Client com fingerprint de browser; sai pelo PROXY_URL quando existir.

    No runner hospedado do GitHub o IP (Azure) toma 403 do Cloudflare. Sem
    PROXY_URL o workflow liga o WARP e o trafego ja' sai por ele.
    """
    proxy = os.environ.get("PROXY_URL")
    extra = {"proxies": [Proxy.all(proxy)]} if proxy else {}
    return Client(emulation=getattr(Emulation, EMULATION), **extra)


async def fetch(client: Client, path: str) -> dict | None:
    """GET com retry/backoff. 404 -> None."""
    global requests_feitos
    hosts = list(HOSTS)
    trocou_host = False
    for tentativa in range(RETRIES):
        requests_feitos += 1
        try:
            resp = await client.get(hosts[0] + path, headers=HEADERS)
            code = _status(resp)
        except Exception as exc:  # noqa: BLE001
            log(f"EXC {path}: {exc}")
            await asyncio.sleep(2**tentativa * 5 + random.uniform(0, 3))
            continue
        if code == 200:
            return await resp.json()
        if code == 404:
            log(f"404 {path}")
            return None
        if code in (403, 429, 503):
            if code == 403 and not trocou_host:
                hosts.reverse()
                trocou_host = True
                log(f"403 -> troca host para {hosts[0]}")
                continue
            await asyncio.sleep(2**tentativa * 5 + random.uniform(0, 3))
            continue
        log(f"{code} {path}")
        return None
    erros.append(f"{path}: falhou apos {RETRIES} tentativas")
    return None


def _gols(bloco: Any, chaves: tuple[str, ...]) -> int | None:
    if not isinstance(bloco, dict):
        return None
    for chave in chaves:
        valor = bloco.get(chave)
        if isinstance(valor, int):
            return valor
    return None


def extrai_placar(evento: dict) -> tuple | None:
    """-> (home, away, status) ou None se o jogo nao acabou."""
    status = ((evento.get("status") or {}).get("type") or "").lower()
    if status not in STATUS_FINAL:
        return None

    normalized = normalize_event(evento)
    if normalized is None:
        return None
    return (normalized['home'], normalized['away'], normalized['status'])


# Eventos de apostas ainda pendentes cujo jogo ja' devia ter acabado, e que
# ainda nao tem placar gravado (ou ficaram num status nao-final).
#
# Dois lugares apontam pra evento: bets.event_* (aposta simples, ou o jogo que
# abre a multipla) e bet_events (cada jogo de uma multipla de varios jogos).
# Sem o segundo, so' o primeiro jogo da multipla ganhava placar e as outras
# pernas ficavam sem liquidar pra sempre. Exige a migration 20260915_bet_events.
PENDENTES = """
SELECT ev.external_id
  FROM (
        SELECT b.event_provider AS provider,
               b.event_external_id AS external_id,
               b.event_start_at AS start_at
          FROM bets b
          JOIN bet_results br ON br.bet_id = b.id
         WHERE br.result_id = 9
           AND b.event_external_id IS NOT NULL
        UNION
        SELECT be.provider, be.external_id, be.start_at
          FROM bet_events be
          JOIN bet_results br ON br.bet_id = be.bet_id
         WHERE br.result_id = 9
       ) ev
  LEFT JOIN event_results er
         ON er.provider = ev.provider
        AND er.external_id = ev.external_id
 WHERE ev.provider = %s
   AND ev.start_at < CURRENT_TIMESTAMP - %s::interval
   AND ev.start_at > CURRENT_TIMESTAMP - %s::interval
   AND (er.external_id IS NULL OR er.fetched_at < CURRENT_TIMESTAMP - INTERVAL '6 hours')
 GROUP BY ev.external_id
 ORDER BY ev.external_id
 LIMIT %s
"""

UPSERT = """
INSERT INTO event_results (
    provider, external_id, home_score, away_score, status, score_scope,
    sport, home_name, away_name, fetched_at
) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s, CURRENT_TIMESTAMP)
ON CONFLICT (provider, external_id) DO UPDATE SET
    home_score = EXCLUDED.home_score,
    away_score = EXCLUDED.away_score,
    status = EXCLUDED.status,
    score_scope = EXCLUDED.score_scope,
    sport = EXCLUDED.sport,
    home_name = EXCLUDED.home_name,
    away_name = EXCLUDED.away_name,
    fetched_at = CURRENT_TIMESTAMP
"""

UPSERT_FACTS = """
INSERT INTO event_facts (provider, external_id, data_json, format_version, fetched_at)
VALUES (%s, %s, %s, 1, CURRENT_TIMESTAMP)
ON CONFLICT (provider, external_id) DO UPDATE SET
    data_json = EXCLUDED.data_json, format_version = 1,
    fetched_at = CURRENT_TIMESTAMP
"""


def _env_do_backend() -> dict[str, str]:
    """Le o .env da raiz do backend, o mesmo que src/infra/db/db.ts usa.

    Sem python-dotenv: e' so' KEY=VALUE, e uma dependencia a mais no runner
    nao se paga pra isso.
    """
    caminho = Path(__file__).resolve().parents[2] / ".env"
    if not caminho.is_file():
        return {}
    valores: dict[str, str] = {}
    for linha in caminho.read_text(encoding="utf-8").splitlines():
        linha = linha.strip()
        if not linha or linha.startswith("#") or "=" not in linha:
            continue
        chave, valor = linha.split("=", 1)
        valores[chave.strip()] = valor.strip().strip('"').strip("'")
    return valores


def conecta() -> psycopg.Connection:
    # prepare_threshold=None: o Supabase atende pelo pooler em modo transacao
    # (porta 6543), onde prepared statement do servidor nao sobrevive entre
    # transacoes, e o executemany do psycopg prepara depois de 5 repeticoes.
    #
    # .strip() porque secret colada com Enter no fim guarda a quebra de linha,
    # e ai o ultimo parametro da URL vira "require<LF>".
    url = (os.environ.get("DATABASE_URL") or "").strip()
    if url:
        return psycopg.connect(url, prepare_threshold=None)

    # Rodando na mao: sem DATABASE_URL, usa as mesmas DB_* do backend. No
    # Actions o secret existe e este caminho nunca e' tomado. Variavel de
    # ambiente ganha do arquivo, pra dar pra apontar pra outro banco.
    env = {**_env_do_backend(), **os.environ}
    faltando = [k for k in ("DB_HOST", "DB_USER", "DB_PASSWORD", "DB_NAME") if not env.get(k)]
    if faltando:
        raise SystemExit(
            "sem DATABASE_URL e sem " + ", ".join(faltando) + " no .env do backend"
        )
    log(f"conectando pelo .env do backend: {env['DB_HOST']}:{env.get('DB_PORT') or 5432}/{env['DB_NAME']}")
    return psycopg.connect(
        host=env["DB_HOST"],
        port=int(env.get("DB_PORT") or 5432),
        user=env["DB_USER"],
        password=env["DB_PASSWORD"],
        dbname=env["DB_NAME"],
        prepare_threshold=None,
    )


def busca_pendentes(conn: psycopg.Connection) -> list[str]:
    with conn.cursor() as cur:
        cur.execute(
            PENDENTES,
            (
                PROVIDER,
                f"{ATRASO_MINIMO_HORAS} hours",
                f"{JANELA_MAXIMA_DIAS} days",
                MAX_EVENTOS_POR_RODADA,
            ),
        )
        return [linha[0] for linha in cur.fetchall()]


async def main() -> None:
    inicio = time.time()
    with conecta() as conn:
        ids = busca_pendentes(conn)
        log(f"{len(ids)} eventos com aposta pendente e jogo ja' encerrado")
        if not ids:
            return

        client = novo_client()

        async def busca(path: str) -> Any:
            return await fetch(client, path)

        async def pausa() -> None:
            await asyncio.sleep(random.uniform(DELAY_MIN, DELAY_MAX))

        # Mesmo cliente, mesmo retry, mesmo intervalo entre requests do placar:
        # o coletor nao abre caminho paralelo pro provider.
        coletor = SofascoreFactsCollector(busca, pausa, log) if COLETA_FATOS else UnverifiedFactsCollector()
        log("coleta de estatisticas: " + ("ligada" if COLETA_FATOS else "desligada (FATOS=0)"))

        linhas: list[tuple] = []
        facts: list[tuple] = []
        for external_id in ids:
            dados = await fetch(client, f"/event/{external_id}")
            await asyncio.sleep(random.uniform(DELAY_MIN, DELAY_MAX))
            evento = (dados or {}).get("event")
            if not evento:
                continue
            result = normalize_event(evento)
            if result is None:
                continue
            # So' vale buscar estatistica de jogo de futebol com placar fechado:
            # adiado ou cancelado nao tem sumula, e seriam 3 requests jogados
            # fora em cima do provider.
            extras: dict = {}
            if result['score_scope'] == 'REGULATION':
                extras = await coletor.collect(external_id, result['home'] + result['away'])
                result['facts'].update(extras)

            linhas.append((PROVIDER, external_id, result['home'], result['away'],
                           result['status'], result['score_scope'], result['sport'],
                           result['home_name'], result['away_name']))
            facts.append((PROVIDER, external_id, Jsonb(result['facts'])))
            coletadas = "+".join(sorted(extras)) or "so placar"
            log(f"{external_id}: {result['home']}x{result['away']} ({result['status']}) [{coletadas}]")

        if linhas:
            with conn.cursor() as cur:
                cur.executemany(UPSERT, linhas)
                cur.executemany(UPSERT_FACTS, facts)
                conn.commit()
        log(f"{len(linhas)} placares gravados de {len(ids)} eventos")

        # Resumo pra conferir o mapa de chaves numa olhada: se um mercado nao
        # esta' liquidando, o nome que falta no mapa esta' nesta linha.
        desconhecidas = getattr(coletor, "desconhecidas", set())
        if desconhecidas:
            log(f"campos do provider fora do mapa ({len(desconhecidas)}): "
                f"{', '.join(sorted(desconhecidas))}")

    m, s = divmod(int(time.time() - inicio), 60)
    log(f"fim em {m}m{s:02d}s, {requests_feitos} requests, {len(erros)} erros")
    for e in erros:
        log(f"ERRO: {e}")


if __name__ == "__main__":
    asyncio.run(main())
