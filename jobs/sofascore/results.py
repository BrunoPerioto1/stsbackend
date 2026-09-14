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
from typing import Any

import psycopg
from wreq import Client, Emulation
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
MAX_EVENTOS_POR_RODADA = 300
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
PENDENTES = """
SELECT DISTINCT b.event_external_id
  FROM bets b
  JOIN bet_results br ON br.bet_id = b.id
  LEFT JOIN event_results er
         ON er.provider = b.event_provider
        AND er.external_id = b.event_external_id
 WHERE br.result_id = 9
   AND b.event_provider = %s
   AND b.event_external_id IS NOT NULL
   AND b.event_start_at < CURRENT_TIMESTAMP - %s::interval
   AND b.event_start_at > CURRENT_TIMESTAMP - %s::interval
   AND (er.external_id IS NULL OR er.fetched_at < CURRENT_TIMESTAMP - INTERVAL '6 hours')
 ORDER BY b.event_external_id
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


def conecta() -> psycopg.Connection:
    # .strip() porque secret colada com Enter no fim guarda a quebra de linha,
    # e ai o ultimo parametro da URL vira "require<LF>".
    url = (os.environ.get("DATABASE_URL") or "").strip()
    if not url:
        raise SystemExit("DATABASE_URL nao definida")
    return psycopg.connect(url)


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

        client = Client(emulation=getattr(Emulation, EMULATION))

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
