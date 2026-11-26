import argparse
import io
import json
import os
import tempfile
import unittest
from contextlib import redirect_stdout
from unittest import mock

import sync
from apply_diff import INSERT, UPDATE

HERE = os.path.dirname(os.path.abspath(__file__))
FIXTURE = os.path.join(os.path.dirname(HERE), 'test.json')


def card(card_id, name='Forest', **overrides):
    value = {
        'object': 'card',
        'id': card_id,
        'name': name,
        'scryfall_uri': f'https://scryfall.com/card/x/1/{name.lower()}',
        'image_status': 'highres_scan',
        'image_uris': {'small': 's.jpg'},
        'layout': 'normal',
        'prices': {'usd': '0.21'},
    }
    value.update(overrides)
    return value


def hashes_for(cards):
    return {c['id']: sync.row_hash(sync.apply_diff.card_to_row(c['id'], c))
            for c in cards}


class FakeCursor:
    def __init__(self, fail_on_call=None):
        self.calls = []
        self.closed = False
        self.fail_on_call = fail_on_call

    def executemany(self, sql, params):
        self.calls.append((sql, list(params)))
        if self.fail_on_call == len(self.calls):
            raise RuntimeError('boom')

    def close(self):
        self.closed = True


class FakeConnection:
    def __init__(self, cursor=None):
        self.cursor_obj = cursor or FakeCursor()
        self.committed = False
        self.rolled_back = False
        self.closed = False

    def cursor(self):
        return self.cursor_obj

    def commit(self):
        self.committed = True

    def rollback(self):
        self.rolled_back = True

    def close(self):
        self.closed = True


def apply_args(state_dir, **overrides):
    values = dict(cards='unused.json', state_dir=state_dir, updated_at='T2',
                  dry_run=False, full=False, batch_size=500)
    values.update(overrides)
    return argparse.Namespace(**values)


class RowHashTest(unittest.TestCase):
    def test_ignores_key_order(self):
        self.assertEqual(sync.row_hash({'a': 1, 'b': {'x': 1, 'y': 2}}),
                         sync.row_hash({'b': {'y': 2, 'x': 1}, 'a': 1}))

    def test_only_stored_columns_count(self):
        # Prices change daily; we don't store them, so no update.
        a = card('a', prices={'usd': '1.00'})
        b = card('a', prices={'usd': '9.00'})
        self.assertEqual(hashes_for([a]), hashes_for([b]))


class SyncPlanTest(unittest.TestCase):
    def test_first_run_inserts_everything(self):
        cards = [card('a'), card('b', 'Island')]
        plan = sync.SyncPlan(iter(cards), {})
        ops = list(plan.operations())
        self.assertEqual([(op.kind, op.card_id) for op in ops],
                         [(INSERT, 'a'), (INSERT, 'b')])
        self.assertEqual(plan.hashes, hashes_for(cards))
        self.assertEqual(plan.removed, [])

    def test_finds_new_changed_unchanged_and_removed(self):
        old = [card('a'), card('b', 'Island'), card('gone', 'Swamp')]
        new = [card('a'),
               card('b', 'Island', image_uris={'small': 'new.jpg'}),
               card('c', 'Mountain')]
        plan = sync.SyncPlan(iter(new), hashes_for(old))
        ops = list(plan.operations())
        self.assertEqual([(op.kind, op.card_id) for op in ops],
                         [(UPDATE, 'b'), (INSERT, 'c')])
        self.assertEqual(ops[0].fields['image_uris'], {'small': 'new.jpg'})
        self.assertEqual(plan.counts['UNCHANGED'], 1)
        self.assertEqual(plan.removed, ['gone'])
        self.assertNotIn('gone', plan.hashes)

    def test_rows_hold_only_stored_columns(self):
        plan = sync.SyncPlan(iter([card('a')]), {})
        [op] = list(plan.operations())
        self.assertEqual(set(op.fields),
                         {'id'} | set(sync.apply_diff.STORED_FIELDS))

    def test_skips_cards_missing_required_columns_without_hashing(self):
        bad = card('a')
        del bad['layout']
        plan = sync.SyncPlan(iter([bad, {'name': 'no id'}]), {})
        self.assertEqual(list(plan.operations()), [])
        self.assertEqual(plan.counts['SKIP'], 2)
        self.assertEqual(plan.hashes, {})


class ExecuteUpsertsTest(unittest.TestCase):
    def ops(self, n):
        return sync.SyncPlan(iter([card(str(i)) for i in range(n)]),
                             {}).operations()

    def test_batches_upserts_in_one_transaction(self):
        conn = FakeConnection()
        written = sync.execute_upserts(conn, self.ops(5), batch_size=2)
        self.assertEqual(written, 5)
        calls = conn.cursor_obj.calls
        self.assertEqual([len(params) for _, params in calls], [2, 2, 1])
        self.assertIn('ON CONFLICT ("id") DO UPDATE', calls[0][0])
        self.assertTrue(conn.committed)
        self.assertFalse(conn.rolled_back)
        self.assertTrue(conn.cursor_obj.closed)

    def test_rolls_back_everything_on_error(self):
        conn = FakeConnection(FakeCursor(fail_on_call=2))
        with self.assertLogs('sync', level='ERROR'):
            with self.assertRaises(RuntimeError):
                sync.execute_upserts(conn, self.ops(5), batch_size=2)
        self.assertFalse(conn.committed)
        self.assertTrue(conn.rolled_back)

    def test_rolls_back_when_reading_the_file_fails_midway(self):
        def broken():
            yield card('a')
            raise ValueError('truncated file')
        conn = FakeConnection()
        plan = sync.SyncPlan(broken(), {})
        with self.assertLogs('sync', level='ERROR'):
            with self.assertRaises(ValueError):
                sync.execute_upserts(conn, plan.operations(), batch_size=1)
        self.assertTrue(conn.rolled_back)
        self.assertFalse(conn.committed)

    def test_rejects_bad_batch_size(self):
        with self.assertRaises(ValueError):
            sync.execute_upserts(FakeConnection(), iter([]), batch_size=0)


class ApplyCommandTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.state = self.tmp.name

    def tearDown(self):
        self.tmp.cleanup()

    def run_apply(self, cards, conn=None, **overrides):
        conn = conn or FakeConnection()
        out = io.StringIO()
        with mock.patch.dict(os.environ, {'DATABASE_URL': 'postgresql://x'}):
            with redirect_stdout(out), self.assertLogs('sync', level='INFO'):
                sync.cmd_apply(apply_args(self.state, **overrides),
                               cards=iter(cards), connect=lambda url: conn)
        return conn, out.getvalue()

    def test_saves_state_after_commit_and_next_run_is_incremental(self):
        cards = [card('a'), card('b', 'Island')]
        conn, _ = self.run_apply(cards, updated_at='T1')
        self.assertTrue(conn.committed and conn.closed)
        self.assertEqual(sync.load_hashes(self.state), hashes_for(cards))
        self.assertEqual(sync.load_state(self.state)['updated_at'], 'T1')

        changed = [card('a'), card('b', 'Island', layout='transform')]
        conn, out = self.run_apply(changed, updated_at='T2')
        [(_, params)] = conn.cursor_obj.calls
        self.assertEqual([p[0] for p in params], ['b'])
        self.assertIn('0 new, 1 changed, 1 unchanged', out)
        self.assertEqual(sync.load_state(self.state)['updated_at'], 'T2')

    def test_full_ignores_saved_hashes(self):
        cards = [card('a')]
        sync.save_state(self.state, hashes_for(cards), 'T1', 1)
        conn, _ = self.run_apply(cards, full=True)
        [(_, params)] = conn.cursor_obj.calls
        self.assertEqual(len(params), 1)

    def test_dry_run_never_connects_or_saves_state(self):
        def no_connect(url):
            raise AssertionError('dry run connected')
        out = io.StringIO()
        with redirect_stdout(out), self.assertLogs('sync', level='INFO'):
            sync.cmd_apply(apply_args(self.state, dry_run=True),
                           cards=iter([card('a')]), connect=no_connect)
        self.assertIn('INSERT a (Forest)', out.getvalue())
        self.assertIn('Dry run, nothing written. 1 cards: 1 new',
                      out.getvalue())
        self.assertEqual(os.listdir(self.state), [])

    def test_failed_write_keeps_old_state(self):
        sync.save_state(self.state, {'a': 'old'}, 'T1', 1)
        conn = FakeConnection(FakeCursor(fail_on_call=1))
        with mock.patch.dict(os.environ, {'DATABASE_URL': 'postgresql://x'}):
            with self.assertLogs('sync', level='INFO'):
                with self.assertRaises(RuntimeError):
                    sync.cmd_apply(apply_args(self.state),
                                   cards=iter([card('a')]),
                                   connect=lambda url: conn)
        self.assertEqual(sync.load_hashes(self.state), {'a': 'old'})
        self.assertEqual(sync.load_state(self.state)['updated_at'], 'T1')
        self.assertTrue(conn.closed)

    def test_needs_database_url(self):
        with mock.patch.dict(os.environ, {}, clear=True):
            with self.assertLogs('sync', level='INFO'):
                with self.assertRaises(SystemExit):
                    sync.cmd_apply(apply_args(self.state),
                                   cards=iter([card('a')]))


class CheckCommandTest(unittest.TestCase):
    LISTING = {'object': 'list', 'data': [
        {'type': 'oracle_cards', 'updated_at': 'X',
         'download_uri': 'https://data.scryfall.io/oracle-cards/o.json'},
        {'type': 'default_cards', 'updated_at': '2026-11-26T10:00:00+00:00',
         'download_uri': 'https://data.scryfall.io/default-cards/d.json'},
    ]}

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.state = self.tmp.name
        self.output = os.path.join(self.state, 'gh_output')

    def tearDown(self):
        self.tmp.cleanup()

    def check(self, force=False):
        args = argparse.Namespace(state_dir=self.state, force=force)
        entry = sync.find_bulk_entry(self.LISTING)
        with mock.patch.object(sync, 'fetch_bulk_entry', return_value=entry), \
                mock.patch.dict(os.environ, {'GITHUB_OUTPUT': self.output}), \
                redirect_stdout(io.StringIO()), \
                self.assertLogs('sync', level='INFO'):
            sync.cmd_check(args)
        with open(self.output) as f:
            lines = f.read().splitlines()
        os.remove(self.output)
        return dict(line.split('=', 1) for line in lines)

    def test_changed_when_never_synced(self):
        out = self.check()
        self.assertEqual(out['changed'], 'true')
        self.assertEqual(out['download_uri'],
                         'https://data.scryfall.io/default-cards/d.json')

    def test_unchanged_when_updated_at_matches_last_sync(self):
        sync.save_state(self.state, {}, '2026-11-26T10:00:00+00:00', 0)
        self.assertEqual(self.check()['changed'], 'false')
        self.assertEqual(self.check(force=True)['changed'], 'true')

    def test_missing_bulk_type_is_an_error(self):
        with self.assertRaises(LookupError):
            sync.find_bulk_entry({'data': []})


class DownloadUriTest(unittest.TestCase):
    def test_accepts_scryfall_hosts(self):
        uri = 'https://data.scryfall.io/default-cards/default-cards-1.json'
        self.assertEqual(sync.check_download_uri(uri), uri)

    def test_rejects_other_hosts_and_http(self):
        for uri in ('https://evil.example/d.json',
                    'http://data.scryfall.io/d.json',
                    'https://scryfall.io.evil.example/d.json'):
            with self.assertRaises(ValueError):
                sync.check_download_uri(uri)


class ConnectRetryTest(unittest.TestCase):
    def test_retries_then_succeeds(self):
        attempts = []

        def flaky(url):
            attempts.append(url)
            if len(attempts) < 3:
                raise OSError('cold start')
            return 'conn'

        with mock.patch.object(sync.db_updater, 'connect', flaky), \
                self.assertLogs('sync', level='WARNING'):
            conn = sync.connect_with_retry(
                'postgresql://u@h/db?schema=public&sslmode=require',
                attempts=5, delay=0, sleep=lambda s: None)
        self.assertEqual(conn, 'conn')
        self.assertEqual(len(attempts), 3)
        self.assertNotIn('schema=', attempts[0])

    def test_gives_up_after_the_last_attempt(self):
        with mock.patch.object(sync.db_updater, 'connect',
                               side_effect=OSError('down')), \
                self.assertLogs('sync', level='WARNING'):
            with self.assertRaises(OSError):
                sync.connect_with_retry('postgresql://x', attempts=2,
                                        delay=0, sleep=lambda s: None)


try:
    import ijson  # noqa: F401
    HAVE_IJSON = True
except ImportError:
    HAVE_IJSON = False


@unittest.skipUnless(HAVE_IJSON, 'ijson not installed')
class IterCardsTest(unittest.TestCase):
    def test_streams_the_fixture_bulk_file(self):
        cards = list(sync.iter_cards(FIXTURE))
        with open(FIXTURE) as f:
            expected = json.load(f)
        self.assertEqual([c['id'] for c in cards],
                         [c['id'] for c in expected])
        # Hashes match the plain json loader, so floats don't drift.
        self.assertEqual(hashes_for(cards), hashes_for(expected))


if __name__ == '__main__':
    unittest.main()
