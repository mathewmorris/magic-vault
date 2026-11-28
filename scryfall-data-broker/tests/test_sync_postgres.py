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
                      updated_at='T', dry_run=False, full=False, prune=False,
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
            cur.execute('SELECT c.id, c.name, c.layout, c.image_uris, '
                        'c.all_parts, p.prices FROM "Card" c '
                        'LEFT JOIN "CardPrice" p ON p."cardId" = c.id '
                        'ORDER BY c.id')
            return {r[0]: r[1:] for r in cur.fetchall()}

    def row_versions(self, table, key):
        """Each row's xmin, which changes whenever the row is rewritten."""
        self.conn.rollback()
        with self.conn.cursor() as cur:
            cur.execute(f'SELECT "{key}", xmin::text FROM "{table}"')
            return dict(cur.fetchall())

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

        cards_before = self.row_versions('Card', 'id')
        out = self.apply(changed, updated_at='T2')
        self.assertIn('1 new, 1 changed, 1 with only a new price', out)
        # The price move left its Card row alone.
        self.assertEqual(self.row_versions('Card', 'id')[changed[1]['id']],
                         cards_before[changed[1]['id']])
        self.assertIn('1 removed', out)
        rows = self.rows()
        self.assertEqual(rows[changed[0]['id']][2]['small'],
                         'https://cards.scryfall.io/x.jpg')
        self.assertEqual(rows[changed[1]['id']][4]['usd'], '999.00')
        self.assertEqual(rows[added['id']][0], 'Brand New Card')
        self.assertIn(removed['id'], rows)

        out = self.apply(changed, updated_at='T3')
        self.assertIn('0 new, 0 changed, 0 with only a new price', out)

    def test_lost_state_rewrites_only_what_changed(self):
        # With no saved hashes every card is sent again, but rows that
        # already match aren't rewritten.
        self.apply(self.cards)
        cards_before = self.row_versions('Card', 'id')
        prices_before = self.row_versions('CardPrice', 'cardId')
        moved = copy.deepcopy(self.cards)
        moved[0]['prices'] = dict(moved[0]['prices'], usd='123.00')
        out = self.apply(moved, state_dir=os.path.join(self.tmp.name, 'fresh'))
        self.assertIn(f'{len(self.cards)} new', out)
        self.assertEqual(self.row_versions('Card', 'id'), cards_before)
        prices_after = self.row_versions('CardPrice', 'cardId')
        changed_ids = {k for k in prices_after
                       if prices_after[k] != prices_before.get(k)}
        self.assertEqual(changed_ids, {moved[0]['id']})
        self.assertEqual(self.rows()[moved[0]['id']][4]['usd'], '123.00')

    def test_pruned_cards_take_their_prices(self):
        self.apply(self.cards)
        with self.conn.cursor() as cur:
            cur.execute('DELETE FROM "Card" WHERE id = %s',
                        (self.cards[0]['id'],))
            cur.execute('SELECT count(*) FROM "CardPrice" WHERE "cardId" = %s',
                        (self.cards[0]['id'],))
            self.assertEqual(cur.fetchone()[0], 0)
        self.conn.rollback()

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
