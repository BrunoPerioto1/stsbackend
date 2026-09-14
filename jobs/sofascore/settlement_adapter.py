"""Normaliza o payload do endpoint já usado: GET /api/v1/event/{id}.

Nenhum endpoint adicional é presumido. Fixtures de teste são sintéticas.
Ausência, campo inválido e current sem normaltime nunca viram zero/90 minutos.
"""
from typing import Any, Protocol


def count(value: Any) -> int | None:
    return value if type(value) is int and value >= 0 else None


def block(value: Any) -> dict:
    return value if isinstance(value, dict) else {}


def normalize_event(event: dict) -> dict | None:
    status = str(block(event.get('status')).get('type', '')).lower()
    if status not in {'finished', 'canceled', 'postponed'}:
        return None
    sport = block(block(block(event.get('tournament')).get('category')).get('sport')).get('name')
    h, a = block(event.get('homeScore')), block(event.get('awayScore'))
    home, away = count(h.get('normaltime')), count(a.get('normaltime'))
    football = isinstance(sport, str) and sport.lower() in {'football', 'soccer', 'futebol'}
    verified = football and home is not None and away is not None
    facts: dict = {}
    # Dois períodos completos, reconciliados com os 90 minutos; nunca current.
    first = (count(h.get('period1')), count(a.get('period1')))
    second = (count(h.get('period2')), count(a.get('period2')))
    if verified and all(v is not None for v in (*first, *second)):
        if first[0] + second[0] == home and first[1] + second[1] == away:
            facts['periods'] = {
                'FIRST_HALF': {'home': first[0], 'away': first[1]},
                'SECOND_HALF': {'home': second[0], 'away': second[1]},
            }
    return {
        'home': home if verified else None,
        'away': away if verified else None,
        'status': status,
        'score_scope': 'REGULATION' if verified else 'UNKNOWN',
        'sport': sport if isinstance(sport, str) else None,
        'home_name': block(event.get('homeTeam')).get('name'),
        'away_name': block(event.get('awayTeam')).get('name'),
        'facts': facts,
    }


class AdditionalFactsCollector(Protocol):
    async def collect(self, external_id: str) -> dict:
        """Retorna snapshots normalizados por capacidade, com completude explícita."""
        ...


class UnverifiedFactsCollector:
    """Sem endpoint confirmado: nenhuma requisição e nenhuma estatística inventada."""
    async def collect(self, external_id: str) -> dict:
        return {}
