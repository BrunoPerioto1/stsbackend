"""Regras de configuracao dos jobs (docs/scanner.md), sem rede e sem banco."""
import asyncio
import unittest
from unittest import mock

import psycopg

import collect
import results
from settlement_adapter import TUDO, FactsConfig

LIMITE = 2_000_000_000  # timestamp bem no futuro: todo jogo cai na janela


def respostas(mapa: dict):
    """fetch falso: valor do mapa por path; Exception no mapa e' levantada."""
    async def fetch(_client, path):
        valor = mapa.get(path)
        if isinstance(valor, Exception):
            raise valor
        return valor
    return fetch


def evento(ident: int) -> dict:
    return {'id': ident, 'startTimestamp': 1_900_000_000, 'tournament': {},
            'homeTeam': {'name': 'A'}, 'awayTeam': {'name': 'B'}}


SEASONS = {'seasons': [{'id': 9}]}


async def sem_pausa():
    return None


class ColetaTests(unittest.TestCase):
    def roda(self, mapa: dict):
        collect.erros.clear()
        with mock.patch.object(collect, 'fetch', respostas(mapa)), \
                mock.patch.object(collect, 'pausa', sem_pausa):
            return asyncio.run(collect.coleta(None, {1: 'Liga'}, LIMITE))

    def test_success_records_ok_with_count(self):
        linhas, estado = self.roda({
            '/unique-tournament/1/seasons': SEASONS,
            '/unique-tournament/1/season/9/events/next/0': {'events': [evento(1), evento(2)]},
        })
        self.assertEqual(estado, {1: ('ok', 2)})
        self.assertEqual(len(linhas), 2)

    def test_valid_season_without_games_records_zero(self):
        # events/next com 404 (fetch -> None) e' temporada sem proximo jogo.
        _, estado = self.roda({'/unique-tournament/1/seasons': SEASONS})
        self.assertEqual(estado, {1: ('ok', 0)})

    def test_unknown_id_is_invalid_id(self):
        _, estado = self.roda({})  # /seasons com 404
        self.assertEqual(estado, {1: ('invalid_id', None)})

    def test_block_keeps_previous_number(self):
        _, estado = self.roda({
            '/unique-tournament/1/seasons': collect.Falha('blocked', 'esgotou'),
        })
        self.assertEqual(estado, {1: ('blocked', None)})

    def test_page_failing_after_another_does_not_record_partial_number(self):
        linhas, estado = self.roda({
            '/unique-tournament/1/seasons': SEASONS,
            '/unique-tournament/1/season/9/events/next/0': {'events': [evento(1)], 'hasNextPage': True},
            '/unique-tournament/1/season/9/events/next/1': collect.Falha('error', 'HTTP 500'),
        })
        self.assertEqual(estado, {1: ('error', None)})
        # O jogo que veio continua valendo pro matching.
        self.assertEqual(len(linhas), 1)


class MainTests(unittest.TestCase):
    def test_no_active_competition_exits_zero(self):
        with mock.patch.object(collect, 'ligas_ativas', return_value={}), \
                mock.patch.object(collect, 'novo_client') as client:
            asyncio.run(collect.main())  # SystemExit faria o teste falhar
        client.assert_not_called()

    def test_empty_run_fails_only_when_some_competition_failed(self):
        casos = {('ok', 0): False, ('blocked', None): True}
        for estado, falha in casos.items():
            with self.subTest(estado=estado):
                async def coleta(*_):
                    return [], {1: estado}
                with mock.patch.object(collect, 'ligas_ativas', return_value={1: 'Liga'}), \
                        mock.patch.object(collect, 'novo_client'), \
                        mock.patch.object(collect, 'coleta', coleta), \
                        mock.patch.object(collect, 'grava'):
                    if falha:
                        with self.assertRaises(SystemExit):
                            asyncio.run(collect.main())
                    else:
                        asyncio.run(collect.main())


class ConfigResultsTests(unittest.TestCase):
    def test_registered_competition_uses_its_flags_and_unknown_fetches_all(self):
        config = {17: FactsConfig(lineups=False)}
        premier = {'tournament': {'uniqueTournament': {'id': 17}}}
        self.assertEqual(results.config_do_evento(config, premier), FactsConfig(lineups=False))
        self.assertEqual(results.config_do_evento(config, {'tournament': {}}), TUDO)
        self.assertEqual(results.config_do_evento(config, {}), TUDO)

    def test_config_unavailable_fetches_all_and_rolls_back(self):
        conn = mock.MagicMock()
        conn.cursor.return_value.__enter__.return_value.execute.side_effect = (
            psycopg.errors.UndefinedTable('scanner_tournaments nao existe'))
        self.assertEqual(results.carrega_config(conn), {})
        conn.rollback.assert_called_once()

    def test_config_rows_become_facts_config(self):
        conn = mock.MagicMock()
        conn.cursor.return_value.__enter__.return_value.fetchall.return_value = [(17, True, False, True)]
        self.assertEqual(results.carrega_config(conn), {17: FactsConfig(True, False, True)})


class AmostraTests(unittest.TestCase):
    def test_summaries_mark_what_the_engine_uses_without_repeating(self):
        import amostra
        stats = {'statistics': [{'period': 'ALL', 'groups': [
            {'groupName': 'Visao', 'statisticsItems': [{'key': 'cornerKicks', 'name': 'Corner kicks', 'home': 9, 'away': 3},
                                                       {'key': 'ballPossession', 'name': 'Ball possession', 'home': '43%', 'away': '57%'}]},
            {'groupName': 'Chutes', 'statisticsItems': [{'key': 'cornerKicks', 'name': 'Corner kicks', 'home': 9, 'away': 3}]}]}]}
        linhas = amostra.resumo_estatisticas(stats)
        self.assertEqual([(l['key'], l['used']) for l in linhas], [('cornerKicks', True), ('ballPossession', False)])
        escalacao = amostra.resumo_escalacao({'confirmed': True, 'home': {'players': [
            {'statistics': {'goals': 1, 'touches': 31, 'ratingVersions': {'original': 7}}}]}})
        self.assertEqual(escalacao['keys'], [{'key': 'goals', 'example': 1, 'used': True},
                                             {'key': 'touches', 'example': 31, 'used': False}])
        self.assertIsNone(amostra.resumo_estatisticas({}))


if __name__ == '__main__':
    unittest.main()
