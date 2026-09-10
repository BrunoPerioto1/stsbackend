"""Alimenta a tabela sport_events com os proximos jogos do SofaScore.

Roda no GitHub Actions, 1x por dia — nao no Vercel. Dois motivos: o teto de
60s da funcao serverless nao comporta o delay anti-bloqueio, e o que passa pelo
Cloudflare do SofaScore e' o fingerprint TLS do wreq (crate Rust). Node/axios
tomam 403; nao existe equivalente em JS.

    DATABASE_URL=postgres://... python collect.py

A API so LE essa tabela. Trocar de provider = trocar este arquivo.
"""

from __future__ import annotations

import asyncio
import os
import random
import sys
import time
from datetime import datetime, timedelta, timezone
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
JANELA_DIAS = 30
MAX_PAGINAS = 5
RETENCAO_DIAS = 2  # jogo que ja aconteceu sai da tabela

PROVIDER = "sofascore"

HEADERS = {
    "Accept": "*/*",
    "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
    "Origin": "https://www.sofascore.com",
    "Referer": "https://www.sofascore.com/",
}

# IDs verificados via /search/all do proprio SofaScore.
LIGAS = {
    17: "Premier League",
    18: "Championship",
    24: "League One",
    8: "LaLiga",
    23: "Serie A",
    35: "Bundesliga",
    44: "2. Bundesliga",
    34: "Ligue 1",
    238: "Liga Portugal Betclic",
    37: "Eredivisie",
    52: "Trendyol Super Lig",
    36: "Scottish Premiership",
    185: "Stoiximan Super League",
    21: "EFL Cup",
    217: "DFB Pokal",
    7: "UEFA Champions League",
    679: "UEFA Europa League",
    17015: "UEFA Conference League",
    325: "Brasileirao Betano",
    390: "Brasileirao Serie B",
    1281: "Brasileirao Serie C",
    373: "Copa Betano do Brasil",
    155: "Liga Profesional de Futbol",
    384: "CONMEBOL Libertadores",
    480: "CONMEBOL Sudamericana",
    242: "MLS",
    955: "Saudi Pro League",
    # Fora do futebol. Mesma estrutura de evento (dois lados, shortName e
    # nameCode), entao entram sem mudanca no coletor.
    132: "NBA",
    9464: "NFL",
    2449: "US Open, Men",
    2601: "US Open, Women",
}

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
        log(f"{code} {path}")
        if code == 200:
            return await resp.json()
        if code == 404:
            return None
        if code in (403, 429, 503):
            if code == 403 and not trocou_host:
                hosts.reverse()
                trocou_host = True
                log(f"403 -> troca host para {hosts[0]}")
                continue
            await asyncio.sleep(2**tentativa * 5 + random.uniform(0, 3))
            continue
        return None
    erros.append(f"{path}: falhou apos {RETRIES} tentativas")
    return None


async def pausa() -> None:
    await asyncio.sleep(random.uniform(DELAY_MIN, DELAY_MAX))


def linha(ev: dict, liga_nome: str) -> tuple:
    """Uma linha de sport_events. shortName/nameCode sao os apelidos que o
    proprio SofaScore mantem ("Man City", "MCI") — o matcher pontua contra os
    tres, e e' o que dispensa tabela de alias pra maioria dos nomes."""
    torneio = ev.get("tournament") or {}
    home = ev.get("homeTeam") or {}
    away = ev.get("awayTeam") or {}
    return (
        PROVIDER,
        str(ev["id"]),
        ((torneio.get("category") or {}).get("sport") or {}).get("name") or "Football",
        torneio.get("name") or liga_nome,
        home.get("name"),
        home.get("shortName"),
        home.get("nameCode"),
        away.get("name"),
        away.get("shortName"),
        away.get("nameCode"),
        datetime.fromtimestamp(ev["startTimestamp"], timezone.utc).replace(tzinfo=None),
        (ev.get("status") or {}).get("type"),
    )


async def coleta(client: Client, limite_ts: int) -> list[tuple]:
    linhas: dict[str, tuple] = {}
    for tid, nome in LIGAS.items():
        try:
            seasons = await fetch(client, f"/unique-tournament/{tid}/seasons")
            await pausa()
            if not seasons or not seasons.get("seasons"):
                erros.append(f"liga {tid} ({nome}): sem temporadas")
                continue
            sid = seasons["seasons"][0]["id"]

            for page in range(MAX_PAGINAS):
                data = await fetch(
                    client, f"/unique-tournament/{tid}/season/{sid}/events/next/{page}"
                )
                await pausa()
                if not data or not data.get("events"):
                    break
                evs = data["events"]
                for ev in evs:
                    if ev["startTimestamp"] <= limite_ts:
                        linhas[str(ev["id"])] = linha(ev, nome)
                if not data.get("hasNextPage") or evs[-1]["startTimestamp"] >= limite_ts:
                    break
        except Exception as exc:  # noqa: BLE001
            # Liga que falha nao derruba as outras.
            erros.append(f"liga {tid} ({nome}): {exc}")
    return list(linhas.values())


UPSERT = """
INSERT INTO sport_events (
    provider, external_id, sport, tournament_name,
    home_name, home_short, home_code,
    away_name, away_short, away_code,
    start_at, status, fetched_at
) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s, CURRENT_TIMESTAMP)
ON CONFLICT (provider, external_id) DO UPDATE SET
    sport = EXCLUDED.sport,
    tournament_name = EXCLUDED.tournament_name,
    home_name = EXCLUDED.home_name,
    home_short = EXCLUDED.home_short,
    home_code = EXCLUDED.home_code,
    away_name = EXCLUDED.away_name,
    away_short = EXCLUDED.away_short,
    away_code = EXCLUDED.away_code,
    start_at = EXCLUDED.start_at,
    status = EXCLUDED.status,
    fetched_at = CURRENT_TIMESTAMP
"""

# Jogo adiado/antecipado: corrige as apostas que ja apontam pra ele. Sem isso o
# cache ficaria certo e a aposta, errada.
PROPAGA = """
UPDATE bets b SET event_start_at = e.start_at
FROM sport_events e
WHERE b.event_provider = e.provider
  AND b.event_external_id = e.external_id
  AND b.event_start_at IS DISTINCT FROM e.start_at
"""

# A aposta guarda a propria copia de event_start_at, entao apagar evento velho
# nao perde nada.
LIMPA = "DELETE FROM sport_events WHERE start_at < CURRENT_TIMESTAMP - %s::interval"


def grava(linhas: list[tuple]) -> None:
    # .strip() porque secret colada com Enter no fim guarda a quebra de linha,
    # e ai o ultimo parametro da URL vira "require<LF>": psycopg recusa com
    # "invalid sslmode value".
    url = (os.environ.get("DATABASE_URL") or "").strip()
    if not url:
        raise SystemExit("DATABASE_URL nao definida")
    with psycopg.connect(url) as conn, conn.cursor() as cur:
        cur.executemany(UPSERT, linhas)
        gravados = cur.rowcount
        cur.execute(PROPAGA)
        corrigidas = cur.rowcount
        cur.execute(LIMPA, (f"{RETENCAO_DIAS} days",))
        apagados = cur.rowcount
        conn.commit()
    log(
        f"sport_events: {gravados} gravados, {apagados} antigos apagados; "
        f"bets: {corrigidas} datas corrigidas"
    )


async def main() -> None:
    inicio = time.time()
    limite_ts = int(
        (datetime.now(timezone.utc) + timedelta(days=JANELA_DIAS)).timestamp()
    )
    client = Client(emulation=getattr(Emulation, EMULATION))
    linhas = await coleta(client, limite_ts)
    log(f"{len(linhas)} eventos coletados em {requests_feitos} requests")

    if not linhas:
        # Coleta vazia e' bloqueio ou queda do provider — nao apaga o cache bom
        # que ja esta no banco.
        erros.append("coleta vazia: nada gravado")
    else:
        grava(linhas)

    m, s = divmod(int(time.time() - inicio), 60)
    log(f"fim em {m}m{s:02d}s, {len(erros)} erros")
    for e in erros:
        log(f"ERRO: {e}")
    # Liga vazia (fase fora da janela) e' normal; so falha se nada foi gravado.
    if not linhas:
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())
