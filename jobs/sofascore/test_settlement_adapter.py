import asyncio
import unittest
from settlement_adapter import normalize_event, UnverifiedFactsCollector


def event(home=None, away=None, sport='Football', status='finished'):
    return {'status': {'type': status}, 'tournament': {'category': {'sport': {'name': sport}}},
            'homeScore': home or {}, 'awayScore': away or {}}


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


if __name__ == '__main__':
    unittest.main()
