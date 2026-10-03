"""Alimenta a tabela sport_events com os proximos jogos do SofaScore.

Roda no GitHub Actions, 2x por semana — nao no Vercel. Dois motivos: o teto de
60s da funcao serverless nao comporta o delay anti-bloqueio, e o que passa pelo
Cloudflare do SofaScore e' o fingerprint TLS do wreq (crate Rust). Node/axios
tomam 403; nao existe equivalente em JS.

    DATABASE_URL=postgres://... python collect.py

A API so LE essa tabela. Trocar de provider = trocar este arquivo.

Competicoes: tabela scanner_tournaments, editada na tela /admin/scanner (era o
dict LIGAS). Cada execucao grava ali o resultado por competicao (last_*), que e'
como id errado ou bloqueio aparecem na tela. Spec: docs/scanner.md.
"""

from __future__ import annotations

import asyncio
import os
import random
import sys
import time
from datetime import datetime, timedelta, timezone
from typing import TYPE_CHECKING, Any

import psycopg

if TYPE_CHECKING:
    from wreq import Client

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
RETENCAO_DIAS = 5  # jogo que ja aconteceu sai da tabela (cobre tip vista dias depois)

PROVIDER = "sofascore"

HEADERS = {
    "Accept": "*/*",
    "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
    "Origin": "https://www.sofascore.com",
    "Referer": "https://www.sofascore.com/",
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


def novo_client() -> Client:
    """Client com fingerprint de browser; sai pelo PROXY_URL quando existir.

    No runner hospedado do GitHub o IP (Azure) toma 403 do Cloudflare. Sem
    PROXY_URL o workflow liga o WARP e o trafego ja' sai por ele.
    """
    # Import aqui, e nao no topo: os testes importam este modulo sem a DLL
    # nativa do wreq (o Windows da maquina de dev bloqueia ela).
    from wreq import Client, Emulation, Proxy

    proxy = os.environ.get("PROXY_URL")
    extra = {"proxies": [Proxy.all(proxy)]} if proxy else {}
    return Client(emulation=getattr(Emulation, EMULATION), **extra)


class Falha(Exception):
    """Request que nao deu resposta util. `status` e' o que vai pra tela em
    scanner_tournaments.last_check_status: 'blocked' ou 'error'."""

    def __init__(self, status: str, msg: str) -> None:
        super().__init__(msg)
        self.status = status


async def fetch(client: Client, path: str) -> dict | None:
    """GET com retry/backoff. 404 -> None; falha levanta Falha.

    Antes falha tambem virava None, e um 500 na /seasons passava por "liga sem
    temporada" (= id errado na tela).
    """
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
            try:
                return await resp.json()
            except Exception as exc:  # noqa: BLE001
                raise Falha("error", f"{path}: resposta nao e' JSON ({exc})") from exc
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
        raise Falha("error", f"{path}: HTTP {code}")
    raise Falha("blocked", f"{path}: falhou apos {RETRIES} tentativas")


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


# Resultado por competicao: (last_check_status, jogos na janela). O numero so'
# existe com 'ok'; nos outros a tela mantem o da ultima coleta valida.
Estado = tuple[str, int | None]


async def coleta(
    client: Client, ligas: dict[int, str], limite_ts: int
) -> tuple[list[tuple], dict[int, Estado]]:
    linhas: dict[str, tuple] = {}
    estado: dict[int, Estado] = {}
    for tid, nome in ligas.items():
        achadas: dict[str, tuple] = {}
        try:
            seasons = await fetch(client, f"/unique-tournament/{tid}/seasons")
            await pausa()
            if not seasons or not seasons.get("seasons"):
                # 404 aqui e' id que nao existe no SofaScore: aparece na tela,
                # onde o id foi digitado.
                erros.append(f"liga {tid} ({nome}): id invalido ou sem temporada")
                estado[tid] = ("invalid_id", None)
                continue
            sid = seasons["seasons"][0]["id"]

            for page in range(MAX_PAGINAS):
                data = await fetch(
                    client, f"/unique-tournament/{tid}/season/{sid}/events/next/{page}"
                )
                await pausa()
                # 404 em events/next e' temporada sem proximo jogo: 0, nao erro.
                if not data or not data.get("events"):
                    break
                evs = data["events"]
                for ev in evs:
                    if ev["startTimestamp"] <= limite_ts:
                        achadas[str(ev["id"])] = linha(ev, nome)
                if not data.get("hasNextPage") or evs[-1]["startTimestamp"] >= limite_ts:
                    break
            estado[tid] = ("ok", len(achadas))
        except Falha as exc:
            erros.append(f"liga {tid} ({nome}): {exc}")
            estado[tid] = (exc.status, None)
        except Exception as exc:  # noqa: BLE001
            # Liga que falha nao derruba as outras.
            erros.append(f"liga {tid} ({nome}): {exc}")
            estado[tid] = ("error", None)
        # Jogo de liga que falhou no meio continua valendo pro matching; so' o
        # numero parcial e' que nao vai pra tela.
        linhas.update(achadas)
    return list(linhas.values()), estado


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


# So' 'ok' mexe no numero (e no quando); falha so' registra a tentativa, pra
# tela mostrar "24 jogos · coleta falhou" em vez de zerar o ultimo valor bom.
ESTADO = """
UPDATE scanner_tournaments SET
    last_check_status = %(status)s::text,
    last_check_at = CURRENT_TIMESTAMP,
    last_events = CASE WHEN %(status)s::text = 'ok' THEN %(n)s::int ELSE last_events END,
    last_events_at = CASE WHEN %(status)s::text = 'ok' THEN CURRENT_TIMESTAMP ELSE last_events_at END
WHERE id = %(id)s
"""


def database_url() -> str:
    # .strip() porque secret colada com Enter no fim guarda a quebra de linha,
    # e ai o ultimo parametro da URL vira "require<LF>": psycopg recusa com
    # "invalid sslmode value".
    url = (os.environ.get("DATABASE_URL") or "").strip()
    if not url:
        raise SystemExit("DATABASE_URL nao definida")
    return url


def ligas_ativas() -> dict[int, str]:
    """Competicoes ligadas na tela /admin/scanner. Erro aqui derruba o job de
    proposito: banco fora nao pode virar "nenhuma competicao ativa"."""
    with psycopg.connect(database_url()) as conn, conn.cursor() as cur:
        cur.execute("SELECT id, name FROM scanner_tournaments WHERE is_active ORDER BY id")
        return dict(cur.fetchall())


def grava(linhas: list[tuple], estado: dict[int, Estado]) -> None:
    with psycopg.connect(database_url()) as conn, conn.cursor() as cur:
        if linhas:
            cur.executemany(UPSERT, linhas)
            gravados = cur.rowcount
            cur.execute(PROPAGA)
            corrigidas = cur.rowcount
            cur.execute(LIMPA, (f"{RETENCAO_DIAS} days",))
            apagados = cur.rowcount
            log(
                f"sport_events: {gravados} gravados, {apagados} antigos apagados; "
                f"bets: {corrigidas} datas corrigidas"
            )
        else:
            # Coleta vazia e' bloqueio ou queda do provider — nao apaga o cache
            # bom que ja esta no banco. O estado por liga grava mesmo assim: e'
            # ele que mostra o bloqueio na tela.
            erros.append("coleta vazia: sport_events intocada")
        cur.executemany(
            ESTADO, [{"id": tid, "status": st, "n": n} for tid, (st, n) in estado.items()]
        )
        conn.commit()


async def main() -> None:
    inicio = time.time()
    ligas = ligas_ativas()
    if not ligas:
        log("nenhuma competicao ativa em scanner_tournaments: nada a coletar")
        return
    limite_ts = int(
        (datetime.now(timezone.utc) + timedelta(days=JANELA_DIAS)).timestamp()
    )
    client = novo_client()
    linhas, estado = await coleta(client, ligas, limite_ts)
    log(f"{len(linhas)} eventos de {len(ligas)} competicoes em {requests_feitos} requests")
    grava(linhas, estado)

    m, s = divmod(int(time.time() - inicio), 60)
    log(f"fim em {m}m{s:02d}s, {len(erros)} erros")
    for e in erros:
        log(f"ERRO: {e}")
    # Liga sem jogo na janela e' normal. Falha e' nada ter vindo E alguma liga
    # nao ter respondido: so' ligas fora de temporada ativas sai com 0.
    if not linhas and any(st != "ok" for st, _ in estado.values()):
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())
