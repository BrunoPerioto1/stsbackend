import asyncio
import unittest
from settlement_adapter import (
    SofascoreFactsCollector,
    UnverifiedFactsCollector,
    normalize_event,
    normalize_incidents,
    normalize_lineups,
    normalize_statistics,
)


def event(home=None, away=None, sport='Football', status='finished'):
    return {'status': {'type': status}, 'tournament': {'category': {'sport': {'name': sport}}},
            'homeScore': home or {}, 'awayScore': away or {}}


def stats(period='ALL', items=None):
    return {'statistics': [{'period': period, 'groups': [{'statisticsItems': items or []}]}]}


def item(key, home, away, name=None):
    return {'key': key, 'name': name or key, 'home': home, 'away': away}


def gol(time, is_home=True, classe='regular'):
    return {'incidentType': 'goal', 'incidentClass': classe, 'time': time, 'isHome': is_home}


def jogador(nome, ident, minutos=90, **estatisticas):
    return {'player': {'name': nome, 'id': ident},
            'statistics': {'minutesPlayed': minutos, **estatisticas}}


class AdapterTests(unittest.TestCase):
    def test_regulation_and_periods(self):
        r = normalize_event(event({'normaltime': 2, 'current': 3, 'period1': 1, 'period2': 1},
                                  {'normaltime': 1, 'current': 2, 'period1': 0, 'period2': 1}))
        self.assertEqual((r['home'], r['away']), (2, 1))
        self.assertEqual(r['facts']['periods']['FIRST_HALF'], {'home': 1, 'away': 0})

    def test_current_is_never_regulation(self):
        r = normalize_event(event({'current': 3}, {'current': 2}))
        self.assertIsNone(r['home'])
        self.assertEqual(r['score_scope'], 'UNKNOWN')

    def test_missing_invalid_and_other_sport(self):
        for value in [None, True, -1, 1.5, '2']:
            self.assertIsNone(normalize_event(event({'normaltime': value}, {'normaltime': 1}))['home'])
        self.assertIsNone(normalize_event(event({'normaltime': 2}, {'normaltime': 1}, 'Basketball'))['home'])

    def test_zero_is_valid_but_periods_must_reconcile(self):
        r = normalize_event(event({'normaltime': 0, 'period1': 1, 'period2': 0}, {'normaltime': 0, 'period1': 0, 'period2': 0}))
        self.assertEqual(r['home'], 0)
        self.assertEqual(r['facts'], {})

    def test_partial_unfinished_and_cancelled(self):
        self.assertIsNone(normalize_event(event(status='inprogress')))
        self.assertIsNone(normalize_event(event(status='canceled'))['home'])
        self.assertEqual(normalize_event(event({'normaltime': 1, 'period1': 1}, {'normaltime': 0}))['facts'], {})

    def test_unverified_collectors_do_not_invent_data(self):
        self.assertEqual(asyncio.run(UnverifiedFactsCollector().collect('123')), {})


class StatisticsTests(unittest.TestCase):
    def test_maps_known_keys_and_scopes(self):
        linhas = normalize_statistics({'statistics': [
            {'period': 'ALL', 'groups': [{'statisticsItems': [
                item('cornerKicks', 6, 3), item('shotsOnGoal', '4', '2'), item('totalShotsOnGoal', 12, 9)]}]},
            {'period': '1ST', 'groups': [{'statisticsItems': [item('cornerKicks', 2, 1)]}]},
        ]})
        self.assertIn({'scope': 'REGULATION', 'metric': 'corners', 'home': 6, 'away': 3}, linhas)
        self.assertIn({'scope': 'REGULATION', 'metric': 'shotsOnTarget', 'home': 4, 'away': 2}, linhas)
        self.assertIn({'scope': 'REGULATION', 'metric': 'shots', 'home': 12, 'away': 9}, linhas)
        self.assertIn({'scope': 'FIRST_HALF', 'metric': 'corners', 'home': 2, 'away': 1}, linhas)

    def test_falls_back_to_the_label_when_there_is_no_key(self):
        linhas = normalize_statistics(stats(items=[{'name': 'Corner kicks', 'home': 5, 'away': 5}]))
        self.assertEqual(linhas, [{'scope': 'REGULATION', 'metric': 'corners', 'home': 5, 'away': 5}])

    def test_unknown_metric_and_non_integer_values_are_dropped(self):
        # Posse ("55%"), precisão ("12/20 (60%)") e chave desconhecida não viram
        # número: adivinhar aqui liquidaria aposta com o dado errado.
        linhas = normalize_statistics(stats(items=[
            item('ballPossession', '55%', '45%'), item('cornerKicks', '6', 'n/d'),
            item('chaveNovaDoProvider', 3, 1)]))
        self.assertEqual(linhas, [])

    def test_conflicting_duplicate_drops_the_metric(self):
        linhas = normalize_statistics({'statistics': [{'period': 'ALL', 'groups': [
            {'statisticsItems': [item('cornerKicks', 6, 3)]},
            {'statisticsItems': [item('cornerKicks', 7, 3)]}]}]})
        self.assertEqual(linhas, [])

    def test_total_cards_only_when_red_is_present(self):
        so_amarelo = normalize_statistics(stats(items=[item('yellowCards', 3, 2)]))
        self.assertEqual([l['metric'] for l in so_amarelo], ['yellowCards'])

        com_vermelho = normalize_statistics(stats(items=[item('yellowCards', 3, 2), item('redCards', 1, 0)]))
        self.assertIn({'scope': 'REGULATION', 'metric': 'cards', 'home': 4, 'away': 2}, com_vermelho)
        # O vermelho sozinho não vira métrica do motor, só entra na soma.
        self.assertNotIn('redCards', [l['metric'] for l in com_vermelho])

    def test_garbage_payload(self):
        for payload in [None, {}, {'statistics': 'x'}, {'statistics': [{'period': 'AET'}]}]:
            self.assertEqual(normalize_statistics(payload), [])


class IncidentsTests(unittest.TestCase):
    def test_chronological_sequence_from_the_reversed_feed(self):
        # O provider devolve do mais recente pro mais antigo.
        feed = normalize_incidents({'incidents': [gol(70, False), gol(30), gol(12)]})
        regulacao = [i for i in feed['items'] if i['scope'] == 'REGULATION']
        self.assertEqual([(i['side'], i['sequence']) for i in regulacao],
                         [('HOME', 1), ('HOME', 2), ('AWAY', 3)])

    def test_each_goal_also_lands_on_its_half(self):
        feed = normalize_incidents({'incidents': [gol(70, False), gol(12)]})
        por_escopo = {(i['scope'], i['side']) for i in feed['items']}
        self.assertEqual(por_escopo, {('REGULATION', 'HOME'), ('FIRST_HALF', 'HOME'),
                                      ('REGULATION', 'AWAY'), ('SECOND_HALF', 'AWAY')})

    def test_penalty_goal_counts_as_goal_and_as_penalty(self):
        feed = normalize_incidents({'incidents': [gol(55, True, 'penalty')]})
        tipos = {i['type'] for i in feed['items']}
        self.assertEqual(tipos, {'GOAL', 'PENALTY_AWARDED'})

    def test_missed_penalty_and_red_card(self):
        feed = normalize_incidents({'incidents': [
            {'incidentType': 'inGamePenalty', 'incidentClass': 'missed', 'time': 20, 'isHome': True},
            {'incidentType': 'card', 'incidentClass': 'yellowRed', 'time': 80, 'isHome': False},
            {'incidentType': 'card', 'incidentClass': 'yellow', 'time': 10, 'isHome': True}]})
        self.assertEqual({i['type'] for i in feed['items']}, {'PENALTY_AWARDED', 'RED_CARD'})

    def test_extra_time_goal_is_left_out_of_regulation(self):
        # O placar que temos é o de 90 minutos; incluir gol da prorrogação
        # quebraria a reconciliação e nenhum mercado de gol liquidaria.
        feed = normalize_incidents({'incidents': [gol(103), gol(30)]})
        self.assertEqual(len([i for i in feed['items'] if i['scope'] == 'REGULATION']), 1)

    def test_unknown_type_marks_the_feed_incomplete(self):
        feed = normalize_incidents({'incidents': [gol(30), {'incidentType': 'lanceNovo', 'time': 40, 'isHome': True}]})
        self.assertFalse(feed['complete'])
        self.assertEqual(feed['items'], [])

    def test_known_noise_keeps_the_feed_complete(self):
        feed = normalize_incidents({'incidents': [
            {'incidentType': 'period', 'text': 'HT', 'time': 45},
            {'incidentType': 'substitution', 'time': 60, 'isHome': True}, gol(30)]})
        self.assertTrue(feed['complete'])
        self.assertEqual(len([i for i in feed['items'] if i['type'] == 'GOAL']), 2)

    def test_garbage_payload(self):
        for payload in [None, {}, {'incidents': 'x'}]:
            self.assertEqual(normalize_incidents(payload), {'complete': False, 'items': []})


class LineupsTests(unittest.TestCase):
    def base(self, **kwargs):
        return {'confirmed': True,
                'home': {'players': [jogador('Pedro', 7, goals=1, goalAssist=1,
                                             totalShots=4, onTargetScoringAttempt=2)]},
                'away': {'players': [jogador('Rony', 11, goals=0, goalAssist=0,
                                             totalShots=0, onTargetScoringAttempt=0)]}, **kwargs}

    def test_metrics_of_a_player_who_played(self):
        items = normalize_lineups(self.base())['items']
        pedro = {i['metric']: i['value'] for i in items if i['name'] == 'Pedro'}
        self.assertEqual(pedro, {'goals': 1, 'assists': 1, 'shots': 4, 'shotsOnTarget': 2})
        self.assertTrue(all(i['played'] and i['scope'] == 'REGULATION' for i in items))
        self.assertEqual({i['participantId'] for i in items if i['name'] == 'Pedro'}, {'7'})

    def test_absent_stat_is_zero_only_because_the_snapshot_is_complete(self):
        rony = {i['metric']: i['value'] for i in normalize_lineups(self.base())['items'] if i['name'] == 'Rony'}
        self.assertEqual(rony, {'goals': 0, 'assists': 0, 'shots': 0, 'shotsOnTarget': 0})

    def test_unconfirmed_lineup_proves_nothing(self):
        feed = normalize_lineups(self.base(confirmed=False))
        self.assertEqual(feed, {'complete': False, 'items': []})

    def test_bench_player_is_not_counted_as_zero(self):
        payload = self.base()
        payload['home']['players'].append({'player': {'name': 'Reserva', 'id': 99}, 'statistics': {}})
        nomes = {i['name'] for i in normalize_lineups(payload)['items']}
        self.assertNotIn('Reserva', nomes)

    def test_broken_entry_invalidates_the_snapshot(self):
        payload = self.base()
        payload['away']['players'].append({'player': {'name': '', 'id': None}})
        self.assertEqual(normalize_lineups(payload), {'complete': False, 'items': []})

    def test_garbage_payload(self):
        for payload in [None, {}, {'confirmed': True, 'home': {}}]:
            self.assertEqual(normalize_lineups(payload), {'complete': False, 'items': []})


class CollectorTests(unittest.TestCase):
    def test_collects_the_three_capabilities(self):
        respostas = {
            '/event/1/statistics': stats(items=[item('cornerKicks', 6, 3)]),
            '/event/1/incidents': {'incidents': [gol(30)]},
            '/event/1/lineups': {'confirmed': True, 'home': {'players': [jogador('Pedro', 7, goals=1)]},
                                 'away': {'players': []}},
        }
        chamadas: list[str] = []

        async def fetch(path):
            chamadas.append(path)
            return respostas.get(path)

        facts = asyncio.run(SofascoreFactsCollector(fetch).collect('1'))
        self.assertEqual(sorted(facts), ['incidents', 'playerStats', 'teamStats'])
        self.assertEqual(len(chamadas), 3)

    def test_one_capability_failing_does_not_take_the_others(self):
        async def fetch(path):
            return {'incidents': [gol(30)]} if path.endswith('/incidents') else None

        facts = asyncio.run(SofascoreFactsCollector(fetch).collect('1'))
        self.assertEqual(list(facts), ['incidents'])


if __name__ == '__main__':
    unittest.main()


class MapaDeChavesTests(unittest.TestCase):
    """As travas contra o provider renomear campo sem ninguém perceber."""

    def test_reports_unmapped_statistic_keys(self):
        desconhecidas: set = set()
        normalize_statistics(stats(items=[
            item('cornerKicks', 6, 3), item('expectedGoals', 2, 1), item('bigChances', 4, 2)]), desconhecidas)
        self.assertEqual(desconhecidas, {'expectedGoals', 'bigChances'})

    def test_reports_unknown_incident_types(self):
        desconhecidos: set = set()
        normalize_incidents({'incidents': [gol(30), {'incidentType': 'lanceNovo', 'time': 40, 'isHome': True}]},
                            desconhecidos)
        self.assertEqual(desconhecidos, {'lancenovo'})

    def test_renamed_player_keys_do_not_settle_as_zero(self):
        # O caso perigoso: escalação confirmada, jogadores em campo, e o mapa
        # inteiro errado. Sem a trava, todo mundo sairia com 0 assistência e
        # "jogador dar assistência" viraria aposta PERDIDA.
        payload = {'confirmed': True, 'away': {'players': []},
                   'home': {'players': [{'player': {'name': 'Pedro', 'id': 7},
                                         'statistics': {'minutesPlayed': 90, 'chaveNova': 2}}]}}
        self.assertEqual(normalize_lineups(payload), {'complete': False, 'items': []})

    def test_player_goals_must_reconcile_with_the_score(self):
        um_gol = {'confirmed': True, 'away': {'players': []},
                  'home': {'players': [jogador('Pedro', 7, goals=1)]}}
        self.assertTrue(normalize_lineups(um_gol, 1)['complete'])
        # Placar diz 3 gols e a súmula só credita 1 (gol contra, por exemplo):
        # o snapshot não prova nada sobre quem marcou.
        self.assertFalse(normalize_lineups(um_gol, 3)['complete'])

    def test_collector_accumulates_unknown_fields_across_events(self):
        async def fetch(path):
            if path.endswith('/statistics'):
                return stats(items=[item('expectedGoals', 2, 1)])
            return None

        coletor = SofascoreFactsCollector(fetch)
        asyncio.run(coletor.collect('1'))
        asyncio.run(coletor.collect('2'))
        self.assertEqual(coletor.desconhecidas, {'expectedGoals'})


class MetricaAusenteTests(unittest.TestCase):
    """O bug que passou: 3 chaves certas e uma errada davam zero silencioso."""

    def test_metric_absent_from_every_player_is_not_emitted(self):
        # Foi exatamente isto com totalShots: as outras chaves existiam, o
        # snapshot era aceito, e "total de chutes do jogador" saía zerado —
        # liquidando como PERDIDA uma aposta que o jogador tinha ganho.
        payload = {'confirmed': True, 'away': {'players': []},
                   'home': {'players': [jogador('Pedro', 7, goals=1, goalAssist=1,
                                                onTargetScoringAttempt=2)]}}
        feed = normalize_lineups(payload, 1)
        self.assertTrue(feed['complete'])
        self.assertEqual(sorted({i['metric'] for i in feed['items']}),
                         ['assists', 'goals', 'shotsOnTarget'])

    def test_zero_from_the_provider_is_not_absence(self):
        # Chave presente com 0 conta como vista: o provider manda goalAssist: 0
        # explicitamente, e aí "não deu assistência" é fato, não silêncio.
        payload = {'confirmed': True, 'away': {'players': []},
                   'home': {'players': [jogador('Pedro', 7, goals=1, goalAssist=0)]}}
        feed = normalize_lineups(payload, 1)
        assists = [i for i in feed['items'] if i['metric'] == 'assists']
        self.assertEqual([i['value'] for i in assists], [0])

    def test_old_and_new_shot_keys_do_not_add_up(self):
        payload = {'confirmed': True, 'away': {'players': []},
                   'home': {'players': [jogador('Pedro', 7, goals=1, totalShots=4,
                                                totalScoringAttempt=4)]}}
        chutes = [i for i in normalize_lineups(payload, 1)['items'] if i['metric'] == 'shots']
        self.assertEqual([i['value'] for i in chutes], [4])
