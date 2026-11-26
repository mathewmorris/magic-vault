"""End-to-end sync against a real, throwaway Postgres.

Skipped unless BROKER_TEST_DATABASE_URL points at a database that has the
Prisma migrations applied (``npx prisma migrate deploy``). The test deletes
every row in "Card", so never point it at a database you care about.
"""
import argparse
import copy
import io
import json
import os
import tempfile
import unittest
from contextlib import redirect_stdout
from unittest import mock

import sync

URL = os.environ.get('BROKER_TEST_DATABASE_URL')
FIXTURE = os.path.join(os.path.dirname(os.path.dirname(
    os.path.abspath(__file__))), 'test.json')


@unittest.skipUnless(URL, 'BROKER_TEST_DATABASE_URL not set')
class PostgresSyncTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.conn = sync.connect_with_retry(URL, attempts=1)
        with self.conn.cursor() as cur:
            cur.execute('DELETE FROM "Card"')
        self.conn.commit()
        with open(FIXTURE) as f:
            self.cards = json.load(f)

    def tearDown(self):
        self.conn.close()
        self.tmp.cleanup()

    def write_bulk(self, cards):
        path = os.path.join(self.tmp.name, 'bulk.json')
        with open(path, 'w') as f:
            json.dump(cards, f)
        return path

    def apply(self, cards, **overrides):
        values = dict(cards=self.write_bulk(cards),
                      state_dir=os.path.join(self.tmp.name, 'state'),
                      updated_at='T', dry_run=False, full=False,
                      batch_size=2)
        values.update(overrides)
        with mock.patch.dict(os.environ, {'DATABASE_URL': URL}), \
                redirect_stdout(io.StringIO()) as out, \
                self.assertLogs('sync', level='INFO'):
            sync.cmd_apply(argparse.Namespace(**values))
        return out.getvalue()

    def rows(self):
        self.conn.rollback()
        with self.conn.cursor() as cur:
            cur.execute('SELECT id, name, layout, image_uris, all_parts, '
                        'prices FROM "Card" ORDER BY id')
            return {r[0]: r[1:] for r in cur.fetchall()}

    def test_first_run_then_incremental_run(self):
        out = self.apply(self.cards, updated_at='T1')
        self.assertIn(f'{len(self.cards)} new', out)
        rows = self.rows()
        self.assertEqual(set(rows), {c['id'] for c in self.cards})
        spirit = next(c for c in self.cards if c['name'] == 'Spirit')
        self.assertEqual(rows[spirit['id']][3], spirit['all_parts'])

        changed = copy.deepcopy(self.cards)
        changed[0]['image_uris']['small'] = 'https://cards.scryfall.io/x.jpg'
        changed[1]['prices'] = dict(changed[1]['prices'], usd='999.00')
        changed[2]['edhrec_rank'] = 999999  # not stored, no update
        removed = changed.pop()                   # left in place
        added = dict(copy.deepcopy(changed[0]), id='ffffffff-0000-0000-0000-'
                     '000000000001', name='Brand New Card')
        changed.append(added)

        out = self.apply(changed, updated_at='T2')
        self.assertIn('1 new, 2 changed', out)
        self.assertIn('1 removed', out)
        rows = self.rows()
        self.assertEqual(rows[changed[0]['id']][2]['small'],
                         'https://cards.scryfall.io/x.jpg')
        self.assertEqual(rows[changed[1]['id']][4]['usd'], '999.00')
        self.assertEqual(rows[added['id']][0], 'Brand New Card')
        self.assertIn(removed['id'], rows)

        out = self.apply(changed, updated_at='T3')
        self.assertIn('0 new, 0 changed', out)

    def test_upserts_over_existing_rows_when_state_is_lost(self):
        self.apply(self.cards)
        renamed = copy.deepcopy(self.cards)
        renamed[0]['name'] = 'Renamed'
        self.apply(renamed, state_dir=os.path.join(self.tmp.name, 'fresh'))
        rows = self.rows()
        self.assertEqual(len(rows), len(self.cards))
        self.assertEqual(rows[renamed[0]['id']][0], 'Renamed')


if __name__ == '__main__':
    unittest.main()
