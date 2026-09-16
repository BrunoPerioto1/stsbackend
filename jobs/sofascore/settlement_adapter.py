"""Normaliza os payloads do Sofascore para os `facts` que o motor de liquidação lê.

Endpoints usados, um por capacidade:

    GET /api/v1/event/{id}              -> placar e tempos   (SCORE_*)
    GET /api/v1/event/{id}/statistics   -> teamStats         (TEAM_STATS)
    GET /api/v1/event/{id}/incidents    -> incidents         (INCIDENTS)
    GET /api/v1/event/{id}/lineups      -> playerStats       (PLAYER_STATS)

Fixtures de teste são sintéticas: as chaves de cada payload precisam ser
conferidas contra uma resposta real. Chave fora do mapa é recolhida e logada
pelo job (SofascoreFactsCollector.desconhecidas), e o efeito dela é o mercado
ficar sem proposta — nunca uma liquidação errada. A exceção é normalize_lineups,
onde ausência significa zero: lá o mapa quebrado tem trava própria.

REGRA QUE VALE PRA TUDO: ausência, campo inválido e formato inesperado nunca
viram zero. Zero só é afirmado onde o snapshot é comprovadamente completo — é
pra isso que `incidents` e `playerStats` carregam `complete`.
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


# ---------------------------------------------------------------- team stats

# Métrica do motor por chave do provider (src/settlement/market-parser.ts,
# statMetrics). Só o que está mapeado aqui é lido: chave desconhecida é
# ignorada em vez de adivinhada, porque confundir "chutes" com "chutes a gol"
# liquidaria errado sem nenhum sinal.
STAT_KEYS: dict[str, str] = {
    'cornerKicks': 'corners',
    'yellowCards': 'yellowCards',
    'totalShotsOnGoal': 'shots',
    'shotsOnGoal': 'shotsOnTarget',
    'fouls': 'fouls',
    'offsides': 'offsides',
    'goalkeeperSaves': 'saves',
}

# Fallback pelo rótulo em inglês, para o caso de o payload não trazer `key`.
STAT_NAMES: dict[str, str] = {
    'corner kicks': 'corners',
    'corners': 'corners',
    'yellow cards': 'yellowCards',
    'total shots': 'shots',
    'shots on goal': 'shotsOnTarget',
    'shots on target': 'shotsOnTarget',
    'fouls': 'fouls',
    'offsides': 'offsides',
    'goalkeeper saves': 'saves',
}

PERIOD_SCOPES = {'ALL': 'REGULATION', '1ST': 'FIRST_HALF', '2ND': 'SECOND_HALF'}

_RED_KEY, _RED_NAME = 'redCards', 'red cards'


def _stat_value(value: Any) -> int | None:
    """Aceita 5 e "5"; recusa "55%", "12/20 (60%)" e negativos."""
    if type(value) is int:
        return value if value >= 0 else None
    if isinstance(value, str) and value.isdigit():
        return int(value)
    return None


def _stat_metric(item: dict) -> str | None:
    key = item.get('key')
    if isinstance(key, str):
        if key == _RED_KEY:
            return _RED_KEY
        if key in STAT_KEYS:
            return STAT_KEYS[key]
    name = item.get('name')
    if isinstance(name, str):
        rotulo = name.strip().lower()
        if rotulo == _RED_NAME:
            return _RED_KEY
        if rotulo in STAT_NAMES:
            return STAT_NAMES[rotulo]
    return None


def normalize_statistics(payload: Any, desconhecidas: set | None = None) -> list[dict]:
    """-> [{'scope','metric','home','away'}], uma linha por métrica e escopo.

    O avaliador recusa métrica duplicada no mesmo escopo, então divergência
    entre dois grupos do payload derruba a métrica inteira em vez de escolher
    uma das duas.

    `desconhecidas` recolhe as chaves que não estão no mapa. O job loga isso na
    primeira rodada: é assim que se descobre que o provider renomeou um campo,
    em vez de ficar procurando por que o mercado não liquida.
    """
    periodos = block(payload).get('statistics')
    if not isinstance(periodos, list):
        return []

    coletado: dict[tuple[str, str], tuple[int, int] | None] = {}
    for periodo in periodos:
        scope = PERIOD_SCOPES.get(str(block(periodo).get('period', '')))
        if not scope:
            continue
        for grupo in block(periodo).get('groups') or []:
            for item in block(grupo).get('statisticsItems') or []:
                if not isinstance(item, dict):
                    continue
                metric = _stat_metric(item)
                home, away = _stat_value(item.get('home')), _stat_value(item.get('away'))
                if metric is None and desconhecidas is not None:
                    rotulo = item.get('key') or item.get('name')
                    if isinstance(rotulo, str) and rotulo:
                        desconhecidas.add(rotulo)
                if not metric or home is None or away is None:
                    continue
                chave = (scope, metric)
                if chave in coletado and coletado[chave] != (home, away):
                    coletado[chave] = None  # conflito: ninguém usa
                else:
                    coletado.setdefault(chave, (home, away))

    linhas = [
        {'scope': scope, 'metric': metric, 'home': valores[0], 'away': valores[1]}
        for (scope, metric), valores in coletado.items()
        if valores is not None and metric != _RED_KEY
    ]

    # "Total de cartões" NÃO sai daqui: statistics omite redCards quando é zero,
    # e só o feed completo de incidentes prova que não houve vermelho. Ver
    # normalize_card_points.
    return linhas


# ----------------------------------------------------------------- incidents

# Tipos que existem no feed e não descrevem gol, pênalti nem vermelho. Tipo
# fora desta lista e fora dos reconhecidos marca o feed como incompleto: pode
# ser justamente o pênalti que a aposta pergunta, e preferimos "sem proposta" a
# uma resposta inventada.
IGNORED_INCIDENTS = {
    'period', 'injurytime', 'substitution', 'vardecision', 'penaltyshootout',
}
RED_CLASSES = {'red', 'yellowred'}


def _incident_scope(minuto: int) -> str | None:
    if minuto <= 45:
        return 'FIRST_HALF'
    if minuto <= 90:
        return 'SECOND_HALF'
    return None  # prorrogação: fora do tempo normal, que é o placar que temos


# Regra da casa, informada pelo usuário em 2026-09-15: vermelho vale 2 amarelos.
# Expulsão por segundo amarelo conta o primeiro amarelo (1) e a expulsão (2).
CARD_POINTS = {'yellow': 1, 'red': 2, 'yellowred': 2}


def normalize_card_points(payload: Any) -> list[dict]:
    """-> linhas 'cardPoints' por escopo (amarelo 1, vermelho 2), ou [] se não der pra provar.

    A métrica tem nome próprio, e não 'cards', porque event_facts de produção
    já guarda 'cards' na contagem antiga (amarelo + vermelho valendo 1): ler
    aquilo com a regra nova daria número errado até o job regravar o evento.

    Só é chamada com feed de incidentes completo — é o que autoriza zero.
    Cartão anulado pelo VAR (`rescinded`) não conta. Cartão sem jogador (banco,
    técnico), classe desconhecida, ou jogador com dois amarelos E expulsão por
    segundo amarelo (o provider teria registrado o segundo amarelo duas vezes)
    deixam a contagem ambígua: nenhuma linha, e o mercado fica sem proposta.
    """
    lances = block(payload).get('incidents')
    if not isinstance(lances, list):
        return []
    pontos = {escopo: [0, 0] for escopo in ('REGULATION', 'FIRST_HALF', 'SECOND_HALF')}
    amarelos: dict[str, int] = {}
    expulsos_por_amarelo: set[str] = set()
    for lance in lances:
        if not isinstance(lance, dict) or str(lance.get('incidentType', '')).lower() != 'card':
            continue
        if lance.get('rescinded') is True:
            continue
        classe = str(lance.get('incidentClass', '')).lower()
        ident = block(lance.get('player')).get('id')
        minuto, lado = count(lance.get('time')), lance.get('isHome')
        if classe not in CARD_POINTS or ident in (None, '') or minuto is None or not isinstance(lado, bool):
            return []
        escopo = _incident_scope(minuto)
        if escopo is None:
            continue  # prorrogação não entra no tempo normal
        if classe == 'yellow':
            amarelos[str(ident)] = amarelos.get(str(ident), 0) + 1
        elif classe == 'yellowred':
            expulsos_por_amarelo.add(str(ident))
        coluna = 0 if lado else 1
        for alvo in ('REGULATION', escopo):
            pontos[alvo][coluna] += CARD_POINTS[classe]
    if any(amarelos.get(jogador, 0) > 1 for jogador in expulsos_por_amarelo):
        return []
    return [{'scope': escopo, 'metric': 'cardPoints', 'home': casa, 'away': fora}
            for escopo, (casa, fora) in pontos.items()]


def contar_gols_contra(payload: Any) -> int:
    """Gols contra do tempo normal, pra reconciliar escalação com o placar.

    Gol contra entra no placar mas não é creditado a nenhum jogador na súmula,
    então sem descontá-lo a trava de reconciliação do normalize_lineups recusa
    o jogo inteiro (visto em Elche 2x3 Real Madrid: 5 no placar, 4 na súmula).
    """
    lances = block(payload).get('incidents')
    if not isinstance(lances, list):
        return 0
    total = 0
    for lance in lances:
        if not isinstance(lance, dict) or str(lance.get('incidentType', '')).lower() != 'goal':
            continue
        if str(lance.get('incidentClass', '')).lower() != 'owngoal':
            continue
        minuto = count(lance.get('time'))
        if minuto is not None and _incident_scope(minuto) is not None:
            total += 1
    return total


def normalize_incidents(payload: Any, desconhecidos: set | None = None) -> dict:
    """-> {'complete': bool, 'items': [...]}.

    Cada lance entra DUAS vezes quando está no tempo normal: uma com
    scope REGULATION e outra com o tempo em que aconteceu. O avaliador filtra
    por escopo exato (`i.scope === c.scope`), então sem a duplicata "primeiro
    gol do 1º tempo" e "primeiro gol do jogo" não poderiam coexistir. A
    `sequence` é o índice cronológico global, igual nas duas cópias — dentro de
    um escopo ela continua única, que é o que o avaliador exige.
    """
    lances = block(payload).get('incidents')
    if not isinstance(lances, list):
        return {'complete': False, 'items': []}

    # O provider devolve do mais recente pro mais antigo. Ordenar por
    # (minuto, acréscimo) com sort estável sobre a lista invertida recupera a
    # ordem do jogo sem depender de campo de ordenação que pode não existir.
    ordenados = sorted(
        reversed(lances),
        key=lambda i: (count(block(i).get('time')) or 0, count(block(i).get('addedTime')) or 0),
    )

    items: list[dict] = []
    completo = True
    sequence = 0
    for lance in ordenados:
        if not isinstance(lance, dict):
            completo = False
            continue
        tipo = str(lance.get('incidentType', '')).lower()
        classe = str(lance.get('incidentClass', '')).lower()
        if tipo in IGNORED_INCIDENTS or (tipo == 'card' and classe not in RED_CLASSES):
            continue

        marcados: list[str] = []
        if tipo == 'goal':
            marcados.append('GOAL')
            if classe == 'penalty':
                marcados.append('PENALTY_AWARDED')
        elif tipo == 'ingamepenalty':
            marcados.append('PENALTY_AWARDED')  # pênalti batido e perdido
        elif tipo == 'card':
            marcados.append('RED_CARD')
        else:
            completo = False  # tipo desconhecido: não dá pra garantir o feed
            if desconhecidos is not None and tipo:
                desconhecidos.add(tipo)
            continue

        minuto = count(lance.get('time'))
        lado = lance.get('isHome')
        if minuto is None or not isinstance(lado, bool):
            completo = False
            continue
        scope = _incident_scope(minuto)
        if scope is None:
            continue  # prorrogação não conta no tempo normal

        sequence += 1
        side = 'HOME' if lado else 'AWAY'
        for tipo_motor in marcados:
            for escopo in ('REGULATION', scope):
                items.append({'type': tipo_motor, 'scope': escopo, 'side': side,
                              'sequence': sequence, 'elapsedSeconds': minuto * 60})

    return {'complete': completo, 'items': items if completo else []}


# --------------------------------------------------------------- player stats

# Métrica do motor por chave de `statistics` do jogador. Cartão do jogador não
# entra: no feed ele é incidente, não estatística, e sem a regra de contagem da
# casa o mercado não liquidaria de qualquer forma.
PLAYER_KEYS = {
    'goals': 'goals',
    'goalAssist': 'assists',
    'totalShots': 'shots',
    'totalScoringAttempt': 'shots',  # nome antigo, visto em payloads mais velhos
    'onTargetScoringAttempt': 'shotsOnTarget',
}


def normalize_lineups(payload: Any, gols_esperados: int | None = None) -> dict:
    """-> {'complete': bool, 'items': [...]}.

    `complete` exige escalação confirmada pelo provider. É o que autoriza
    afirmar zero: sem confirmação, estatística ausente pode ser dado que ainda
    não chegou, e "não marcou" viraria uma aposta perdida sem prova.

    Aqui está o único ponto do adaptador em que uma chave errada liquidaria
    ERRADO em vez de deixar sem proposta: se `goalAssist` mudasse de nome, todo
    mundo sairia com zero assistência num snapshot marcado como completo, e
    "jogador dar assistência" viraria aposta perdida. Duas travas contra isso:

    1. métrica que não apareceu em NENHUM jogador do jogo não é emitida. A
       trava é por métrica, e não global, porque foi assim que `totalShots`
       passou despercebido: as outras três chaves existiam, o snapshot era
       aceito, e só "total de chutes do jogador" saía zerado;
    2. a soma dos gols dos jogadores tem que bater com o placar (quando ele é
       informado). Jogo com gol contra não fecha essa conta e fica de fora —
       perder a liquidação de um jogo é barato, liquidar errado não é.
    """
    dados = block(payload)
    confirmado = dados.get('confirmed') is True
    items: list[dict] = []
    vistas: set[str] = set()
    gols_somados = 0

    for lado in ('home', 'away'):
        jogadores = block(dados.get(lado)).get('players')
        if not isinstance(jogadores, list):
            return {'complete': False, 'items': []}
        for entrada in jogadores:
            jogador = block(block(entrada).get('player'))
            nome, identificador = jogador.get('name'), jogador.get('id')
            if not isinstance(nome, str) or not nome.strip() or identificador in (None, ''):
                return {'complete': False, 'items': []}
            estatisticas = block(block(entrada).get('statistics'))
            # Reserva que não entrou não tem minuto; o motor exige played=true,
            # então ela some da avaliação em vez de contar zero.
            minutos = count(estatisticas.get('minutesPlayed'))
            if not minutos:
                continue
            # Duas chaves podem apontar pra mesma métrica (nome novo e antigo do
            # provider): vale a primeira que existir, nunca a soma das duas.
            valores: dict[str, int] = {}
            for chave, metric in PLAYER_KEYS.items():
                valor = count(estatisticas.get(chave))
                if valor is not None and metric not in valores:
                    valores[metric] = valor
                    vistas.add(metric)
            gols_somados += valores.get('goals', 0)

            for metric in dict.fromkeys(PLAYER_KEYS.values()):
                items.append({
                    'scope': 'REGULATION', 'name': nome.strip(),
                    'participantId': str(identificador), 'played': True,
                    'metric': metric, 'value': valores.get(metric, 0),
                })

    gols_batem = gols_esperados is None or gols_somados == gols_esperados
    completo = confirmado and bool(vistas) and gols_batem
    # Métrica nunca vista sai: zero em cima de chave que não existe é o que
    # transformaria "jogador deu assistência" em aposta perdida.
    return {'complete': completo,
            'items': [i for i in items if i['metric'] in vistas] if completo else []}


class AdditionalFactsCollector(Protocol):
    async def collect(self, external_id: str, gols: int | None = None) -> dict:
        """Retorna snapshots normalizados por capacidade, com completude explícita."""
        ...


class UnverifiedFactsCollector:
    """Coleta desligada (FATOS=0): nenhuma requisição e nenhuma estatística inventada."""
    async def collect(self, external_id: str, gols: int | None = None) -> dict:
        return {}


class SofascoreFactsCollector:
    """Junta os três payloads extras num único bloco de `facts`.

    Recebe o `fetch` do job (mesmo cliente, mesmo retry, mesmo rate limit) em
    vez de abrir conexão própria, e um `sleep` opcional pra respeitar o
    intervalo entre requests. Custo: 3 GETs por evento além do placar.

    Capacidade que falhar sai de fora do dicionário — o mercado dela fica em
    "sem proposta" e o resto do lote continua liquidando normalmente.
    """

    def __init__(self, fetch, sleep=None, log=None):
        self._fetch = fetch
        self._sleep = sleep
        self._log = log
        # Acumula entre eventos pra virar um resumo no fim da rodada, em vez de
        # repetir a mesma chave desconhecida 300 vezes no log.
        self.desconhecidas: set[str] = set()

    async def _get(self, path: str) -> Any:
        dados = await self._fetch(path)
        if self._sleep is not None:
            await self._sleep()
        return dados

    async def collect(self, external_id: str, gols: int | None = None) -> dict:
        facts: dict = {}
        novas: set[str] = set()

        estatisticas = normalize_statistics(
            await self._get(f'/event/{external_id}/statistics'), novas)
        if estatisticas:
            facts['teamStats'] = estatisticas

        feed = await self._get(f'/event/{external_id}/incidents')
        incidentes = normalize_incidents(feed, novas)
        if incidentes['complete']:
            facts['incidents'] = incidentes
            pontos = normalize_card_points(feed)
            if pontos:
                facts.setdefault('teamStats', []).extend(pontos)

        # Gol contra não aparece na súmula de nenhum jogador: descontar antes de
        # reconciliar. Só com o feed íntegro — feed suspeito não afrouxa a trava.
        esperados = gols
        if esperados is not None and incidentes['complete']:
            esperados -= contar_gols_contra(feed)
        jogadores = normalize_lineups(await self._get(f'/event/{external_id}/lineups'), esperados)
        if jogadores['complete']:
            facts['playerStats'] = jogadores
        elif self._log is not None and jogadores['items']:
            # Tinha jogador com minuto em campo e ainda assim o snapshot foi
            # recusado: ou o mapa de chaves quebrou, ou os gols não fecharam.
            self._log(f'{external_id}: escalação recusada na reconciliação')

        # Sem log por evento: o provider manda ~40 campos que o motor não usa
        # (passes, xG, duelos), e a primeira rodada real virou uma linha de 40
        # nomes a cada jogo. O resumo único no fim do results.py basta.
        self.desconhecidas |= novas
        return facts
