"""Busca o placar dos jogos que ja' terminaram e alimenta event_results.

    DATABASE_URL=postgres://... python results.py

Roda depois dos jogos (varias vezes ao dia). Companheiro do collect.py: aquele
traz os jogos que VAO acontecer, este traz o placar dos que JA' aconteceram.

Por que e' barato: a aposta ja' guarda `event_external_id` — o matching de time
foi feito na criacao dela, por src/bet/event-matching.ts. Aqui e' um GET por
evento, sem paginar liga nenhuma. Isso tambem tira o limite de competicoes:
funciona pra Libertadores, Conference League ou qualquer torneio que o usuario
tenha apostado, nao so' pras ligas listadas no collect.py.

ENDPOINT
    GET /api/v1/event/{id}  ->  {"event": {... homeScore, awayScore, status}}

Verificado contra api.sofascore.com em 2026-09-09. Passa pelo Cloudflare pelo
fingerprint TLS do wreq, mesma dependencia do collect.py.

PLACAR: usamos `normaltime` (90min) com fallback pra `current`. Mercado de
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

    home = _gols(evento.get("homeScore"), ("normaltime", "current"))
    away = _gols(evento.get("awayScore"), ("normaltime", "current"))
    if status == "finished" and (home is None or away is None):
        # Diz que acabou mas nao tem placar: nao inventa 0x0.
        return None

    return (home or 0, away or 0, status)


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
   AND (er.external_id IS NULL OR er.status <> 'finished')
 ORDER BY b.event_external_id
 LIMIT %s
"""

UPSERT = """
INSERT INTO event_results (
    provider, external_id, home_score, away_score, status, fetched_at
) VALUES (%s,%s,%s,%s,%s, CURRENT_TIMESTAMP)
ON CONFLICT (provider, external_id) DO UPDATE SET
    home_score = EXCLUDED.home_score,
    away_score = EXCLUDED.away_score,
    status = EXCLUDED.status,
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
        linhas: list[tuple] = []
        for external_id in ids:
            dados = await fetch(client, f"/event/{external_id}")
            await asyncio.sleep(random.uniform(DELAY_MIN, DELAY_MAX))
            evento = (dados or {}).get("event")
            if not evento:
                continue
            placar = extrai_placar(evento)
            if placar is None:
                continue
            linhas.append((PROVIDER, external_id, *placar))
            log(f"{external_id}: {placar[0]}x{placar[1]} ({placar[2]})")

        if linhas:
            with conn.cursor() as cur:
                cur.executemany(UPSERT, linhas)
                conn.commit()
        log(f"{len(linhas)} placares gravados de {len(ids)} eventos")

    m, s = divmod(int(time.time() - inicio), 60)
    log(f"fim em {m}m{s:02d}s, {requests_feitos} requests, {len(erros)} erros")
    for e in erros:
        log(f"ERRO: {e}")


if __name__ == "__main__":
    asyncio.run(main())
