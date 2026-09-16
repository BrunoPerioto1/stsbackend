"""Confere o mapa de chaves contra um jogo real, sem tocar no banco.

    jobs/sofascore/.venv/Scripts/python.exe jobs/sofascore/conferir_fatos.py 12345678

O id e' o do evento no SofaScore — esta' no fim da URL do jogo no site, em
.../flamengo-vasco/xyz#id:12345678.

Nao grava nada e nao precisa de DATABASE_URL: so' busca os tres endpoints de
fatos, roda os normalizadores e mostra o que foi reconhecido, o que ficou de
fora e o que o motor conseguiria liquidar com isso. E' a conferencia que o
docstring do settlement_adapter pede antes de confiar nos numeros.
"""

from __future__ import annotations

import asyncio
import sys

from wreq import Client, Emulation

from results import EMULATION, fetch
from settlement_adapter import (
    normalize_event,
    normalize_incidents,
    normalize_lineups,
    normalize_statistics,
)

SIM, NAO = "OK  ", "-- "

# O console do Windows abre em cp1252 e "Nicolo` Barella" derrubava o script no
# meio do relatorio. O dado no banco e' UTF-8; aqui e' so' a impressao.
for fluxo in (sys.stdout, sys.stderr):
    try:
        fluxo.reconfigure(encoding="utf-8", errors="replace")
    except (AttributeError, ValueError):  # noqa: PERF203
        pass


async def main(external_id: str) -> int:
    client = Client(emulation=getattr(Emulation, EMULATION))

    evento = (await fetch(client, f"/event/{external_id}") or {}).get("event")
    if not evento:
        print(f"evento {external_id} nao encontrado")
        return 1
    placar = normalize_event(evento)
    if placar is None:
        print("jogo ainda nao terminou (ou status nao final)")
        return 1
    print(f"\n{placar['home_name']} {placar['home']} x {placar['away']} {placar['away_name']}"
          f"  ({placar['status']}, {placar['sport']})\n")

    desconhecidas: set[str] = set()

    # ---- teamStats
    linhas = normalize_statistics(await fetch(client, f"/event/{external_id}/statistics"), desconhecidas)
    reconhecidas = {l["metric"] for l in linhas}
    print("TEAM_STATS")
    for metric in ("corners", "shots", "shotsOnTarget", "fouls", "offsides", "saves", "yellowCards", "cards"):
        linha = next((l for l in linhas if l["metric"] == metric and l["scope"] == "REGULATION"), None)
        marca = SIM if linha else NAO
        valor = f"{linha['home']} x {linha['away']}" if linha else "nao veio"
        print(f"  {marca}{metric:<14} {valor}")
    parciais = sorted({l["scope"] for l in linhas} - {"REGULATION"})
    print(f"  escopos alem do jogo inteiro: {', '.join(parciais) or 'nenhum'}")

    # ---- incidents
    feed = normalize_incidents(await fetch(client, f"/event/{external_id}/incidents"), desconhecidas)
    gols = [i for i in feed["items"] if i["type"] == "GOAL" and i["scope"] == "REGULATION"]
    print("\nINCIDENTS")
    print(f"  {SIM if feed['complete'] else NAO}feed completo")
    print(f"  gols no tempo normal: {len(gols)} (placar diz {(placar['home'] or 0) + (placar['away'] or 0)})")
    print(f"  ordem: {' -> '.join(g['side'] for g in gols) or 'nenhum'}")
    for tipo in ("PENALTY_AWARDED", "RED_CARD"):
        quantos = len({i["sequence"] for i in feed["items"] if i["type"] == tipo})
        print(f"  {tipo}: {quantos}")

    # ---- playerStats
    gols_totais = (placar["home"] or 0) + (placar["away"] or 0)
    jogadores = normalize_lineups(await fetch(client, f"/event/{external_id}/lineups"), gols_totais)
    print("\nPLAYER_STATS")
    print(f"  {SIM if jogadores['complete'] else NAO}snapshot aceito")
    if not jogadores["complete"]:
        # A recusa tem dois motivos possiveis e eles pedem acoes diferentes.
        sem_trava = normalize_lineups(await fetch(client, f"/event/{external_id}/lineups"))
        if sem_trava["complete"]:
            print("  motivo: os gols dos jogadores nao bateram com o placar")
            print("          (gol contra explica; mapa de chaves quebrado tambem)")
        else:
            print("  motivo: escalacao nao confirmada, ou nenhuma chave do mapa apareceu")
            print("          -> revise PLAYER_KEYS em settlement_adapter.py")
    else:
        nomes = sorted({i["name"] for i in jogadores["items"]})
        print(f"  {len(nomes)} jogadores com minuto em campo")
        destaques = [i for i in jogadores["items"] if i["value"] > 0]
        for i in sorted(destaques, key=lambda x: (-x["value"], x["name"]))[:12]:
            print(f"     {i['name']}: {i['metric']} = {i['value']}")
        if not destaques:
            print("     nenhum jogador com estatistica > 0 — suspeito, confira PLAYER_KEYS")

    print(f"\nCAMPOS FORA DO MAPA: {', '.join(sorted(desconhecidas)) or 'nenhum'}")
    return 0


def id_do_argumento(valor: str) -> str:
    """Aceita o id cru ou a URL do jogo colada do site."""
    if "id:" in valor:
        valor = valor.rsplit("id:", 1)[1]
    valor = valor.strip().strip("/#")
    if not valor.isdigit():
        raise SystemExit(f"nao achei um id de evento em {valor!r}")
    return valor


if __name__ == "__main__":
    if len(sys.argv) != 2:
        raise SystemExit(__doc__)
    raise SystemExit(asyncio.run(main(id_do_argumento(sys.argv[1]))))
