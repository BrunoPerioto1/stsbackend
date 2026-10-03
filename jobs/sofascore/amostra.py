"""Amostra do que cada competicao do scanner entrega.

Pega o ultimo jogo encerrado de cada competicao, resume /statistics,
/incidents e /lineups e grava em scanner_tournaments.sample, que a tela
/admin/scanner mostra no botao "Dados". Marca o que o motor de liquidacao usa
(STAT_KEYS e PLAYER_KEYS do adaptador), pra ver o que existe e nao e' usado.

Sob demanda, nao no cron: o que cada liga entrega muda pouco, e sao ~5
requests por competicao.

    DATABASE_URL=... python amostra.py           # todas, inclusive pausadas
    DATABASE_URL=... python amostra.py 17 325    # so essas
"""

from __future__ import annotations

import asyncio
import sys
from datetime import datetime, timezone
from typing import Any

import psycopg
from psycopg.types.json import Jsonb

from collect import Falha, database_url, fetch, log, novo_client, pausa
from settlement_adapter import PLAYER_KEYS, STAT_KEYS


async def ultimo_jogo(client: Any, tid: int) -> dict | None:
    """Ultimo jogo encerrado da temporada atual; sem nenhum, tenta a anterior
    (liga que acabou de virar a temporada)."""
    seasons = (await fetch(client, f"/unique-tournament/{tid}/seasons") or {}).get("seasons") or []
    await pausa()
    for season in seasons[:2]:
        data = await fetch(client, f"/unique-tournament/{tid}/season/{season['id']}/events/last/0")
        await pausa()
        encerrados = [e for e in (data or {}).get("events") or []
                      if (e.get("status") or {}).get("type") == "finished"]
        if encerrados:
            return max(encerrados, key=lambda e: e["startTimestamp"])
    return None


def resumo_estatisticas(payload: Any) -> list[dict] | None:
    """Uma linha por estatistica do jogo inteiro, sem repetir a que aparece em
    dois grupos (o provider repete "Total shots" em Visao geral e Chutes)."""
    periodos = (payload or {}).get("statistics") or []
    jogo = next((p for p in periodos if p.get("period") == "ALL"), None)
    if not jogo:
        return None
    vistas: set[str] = set()
    linhas = []
    for grupo in jogo.get("groups") or []:
        for item in grupo.get("statisticsItems") or []:
            chave = item.get("key") or item.get("name")
            if not chave or chave in vistas:
                continue
            vistas.add(chave)
            linhas.append({"key": chave, "name": item.get("name"), "group": grupo.get("groupName"),
                           "home": item.get("home"), "away": item.get("away"), "used": chave in STAT_KEYS})
    return linhas or None


def resumo_lances(payload: Any) -> dict[str, int] | None:
    lances = (payload or {}).get("incidents")
    if not isinstance(lances, list):
        return None
    tipos: dict[str, int] = {}
    for lance in lances:
        tipo = "/".join(str(p) for p in (lance.get("incidentType"), lance.get("incidentClass")) if p)
        tipos[tipo] = tipos.get(tipo, 0) + 1
    return tipos


def resumo_escalacao(payload: Any) -> dict | None:
    if not payload:
        return None
    jogadores = [j for lado in ("home", "away") for j in (payload.get(lado) or {}).get("players") or []]
    exemplos: dict[str, Any] = {}
    for jogador in jogadores:
        for chave, valor in (jogador.get("statistics") or {}).items():
            # Dict (ratingVersions, statisticsType) e' metadado, nao estatistica.
            if isinstance(valor, (int, float)) and chave not in exemplos:
                exemplos[chave] = valor
    return {"confirmed": payload.get("confirmed") is True, "players": len(jogadores),
            "keys": [{"key": k, "example": v, "used": k in PLAYER_KEYS} for k, v in sorted(exemplos.items())]}


def faltando(chaves_presentes: set[str], mapa: dict[str, str]) -> list[str]:
    """Métricas que o motor lê e não vieram, cada uma pela 1ª chave do provider
    que a alimenta (a tela traduz por ela). Duas chaves pra mesma métrica
    ('totalShots' e o antigo 'totalScoringAttempt'): basta uma ter vindo."""
    presentes = {mapa[k] for k in chaves_presentes if k in mapa}
    primeira: dict[str, str] = {}
    for chave, metrica in mapa.items():
        primeira.setdefault(metrica, chave)
    return [chave for metrica, chave in primeira.items() if metrica not in presentes]


async def amostra(client: Any, tid: int) -> dict:
    jogo = await ultimo_jogo(client, tid)
    if not jogo:
        return {"event": None}
    eid = jogo["id"]
    partes = {}
    for nome in ("statistics", "incidents", "lineups"):
        partes[nome] = await fetch(client, f"/event/{eid}/{nome}")
        await pausa()
    casa, fora = jogo.get("homeScore") or {}, jogo.get("awayScore") or {}
    estatisticas = resumo_estatisticas(partes["statistics"])
    escalacao = resumo_escalacao(partes["lineups"])
    return {
        "event": {
            "id": eid,
            "home": (jogo.get("homeTeam") or {}).get("name"),
            "away": (jogo.get("awayTeam") or {}).get("name"),
            "score": f"{casa.get('display', '?')}x{fora.get('display', '?')}",
            "startAt": datetime.fromtimestamp(jogo["startTimestamp"], timezone.utc).isoformat(),
        },
        "statistics": estatisticas,
        "incidents": resumo_lances(partes["incidents"]),
        "lineups": escalacao,
        # "Dá pra liquidar?": o que o motor precisa e esta liga não entregou.
        # Escalação não confirmada conta como faltando tudo: o adaptador recusa.
        "missing": {
            "statistics": faltando({i["key"] for i in estatisticas or []}, STAT_KEYS),
            "lineups": faltando({k["key"] for k in (escalacao or {}).get("keys", [])}
                                if escalacao and escalacao["confirmed"] else set(), PLAYER_KEYS),
        },
    }


async def main() -> None:
    filtro = [int(a) for a in sys.argv[1:]]
    with psycopg.connect(database_url()) as conn, conn.cursor() as cur:
        cur.execute("SELECT id, name FROM scanner_tournaments ORDER BY id")
        ligas = [(tid, nome) for tid, nome in cur.fetchall() if not filtro or tid in filtro]
    client = novo_client()
    feitas = 0
    for tid, nome in ligas:
        try:
            dados = await amostra(client, tid)
        except Falha as exc:
            # Mantem a amostra anterior: falha de rede nao apaga o que ja' se viu.
            log(f"{tid} {nome}: {exc}")
            continue
        # Uma conexao por liga: segurar uma aberta 25 min ociosa e' pedir pro
        # pooler derrubar.
        with psycopg.connect(database_url()) as conn:
            conn.execute("UPDATE scanner_tournaments SET sample = %s, sample_at = CURRENT_TIMESTAMP WHERE id = %s",
                         (Jsonb(dados), tid))
        feitas += 1
        ev = dados["event"]
        log(f"{tid} {nome}: " + (f"{ev['home']} {ev['score']} {ev['away']}, "
                                 f"{len(dados['statistics'] or [])} estatisticas" if ev else "sem jogo encerrado"))
    log(f"{feitas} de {len(ligas)} amostras gravadas")


if __name__ == "__main__":
    asyncio.run(main())
