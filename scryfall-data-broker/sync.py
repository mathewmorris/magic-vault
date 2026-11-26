###################################################
# Scheduled sync of Scryfall bulk data into the Card table
###################################################
# Used by .github/workflows/scryfall-sync.yml, and runnable by hand:
#
#   python sync.py check --state-dir state
#   python sync.py download <download_uri> --out default_cards.json
#   python sync.py apply default_cards.json --state-dir state --dry-run
#
# Instead of loading two ~460 MB bulk files and running DeepDiff on them,
# "apply" streams the new file one card at a time and compares a hash of the
# columns we store against the hashes saved by the last run (state/hashes.json,
# about 10 MB). New cards and cards whose stored columns changed are upserted
# in batches, all in one transaction. With no saved hashes (first run, lost
# cache, or --full) every card is upserted; nothing is ever deleted.
#
# State is only written after the database commit succeeds, and never on a
# dry run, so a failed or dry run leaves the next run to pick up the changes.
import argparse
import hashlib
import json
import logging
import logging.config
import os
import sys
import time
from datetime import datetime, timezone
from urllib.parse import urlsplit

import apply_diff
import db_updater
from apply_diff import INSERT, UPDATE, Operation

HERE = os.path.dirname(os.path.abspath(__file__))
logger = logging.getLogger('sync')

BULK_DATA_URL = 'https://api.scryfall.com/bulk-data'
BULK_TYPE = 'default_cards'
HEADERS = {
    'User-Agent': 'MagicVaultScryfallDataBroker/1.0 '
                  '(+https://github.com/mathewmorris/magic-vault)',
    'Accept': 'application/json;q=1.0,*/*;q=0.9',
}
STATE_FILE = 'state.json'
HASHES_FILE = 'hashes.json'
# Scryfall serves bulk files from these hosts.
DOWNLOAD_HOST_SUFFIXES = ('.scryfall.io', '.scryfall.com')


###################################################
# State saved between runs
###################################################

def load_json(path, default):
    try:
        with open(path, 'r') as f:
            return json.load(f)
    except FileNotFoundError:
        return default


def write_json_atomic(path, value):
    tmp = f"{path}.tmp"
    with open(tmp, 'w') as f:
        json.dump(value, f, separators=(',', ':'))
    os.replace(tmp, path)


def load_state(state_dir):
    return load_json(os.path.join(state_dir, STATE_FILE), {})


def load_hashes(state_dir):
    return load_json(os.path.join(state_dir, HASHES_FILE), {})


def save_state(state_dir, hashes, updated_at, card_count):
    os.makedirs(state_dir, exist_ok=True)
    write_json_atomic(os.path.join(state_dir, HASHES_FILE), hashes)
    write_json_atomic(os.path.join(state_dir, STATE_FILE), {
        'updated_at': updated_at,
        'card_count': card_count,
        'synced_at': datetime.now(timezone.utc).isoformat(),
    })


###################################################
# Planning (pure)
###################################################

def row_hash(row):
    """Stable hash of the columns we store for one card."""
    encoded = json.dumps(row, sort_keys=True, separators=(',', ':'),
                         ensure_ascii=False)
    return hashlib.sha256(encoded.encode('utf-8')).hexdigest()


class SyncPlan:
    """Compare streamed cards to the last run's hashes.

    Iterate ``operations()`` once; afterwards ``hashes`` holds the new
    id -> hash map and ``removed`` the ids that disappeared from Scryfall.
    """

    def __init__(self, cards, previous_hashes):
        self._cards = cards
        self.previous = previous_hashes
        self.hashes = {}
        self.counts = {INSERT: 0, UPDATE: 0, 'UNCHANGED': 0, 'SKIP': 0}
        self.removed = []
        self.done = False

    def operations(self):
        for card in self._cards:
            card_id = card.get('id') if isinstance(card, dict) else None
            if not card_id:
                self.counts['SKIP'] += 1
                logger.warning('Skipping a card with no id')
                continue
            row = apply_diff.card_to_row(card_id, card)
            missing = [name for name in apply_diff.REQUIRED_FIELDS
                       if row.get(name) is None]
            if missing:
                # Not hashed, so it is tried again next run.
                self.counts['SKIP'] += 1
                logger.warning('Skipping %s: missing %s', card_id,
                               ', '.join(missing))
                continue
            digest = row_hash(row)
            self.hashes[card_id] = digest
            old = self.previous.get(card_id)
            if old == digest:
                self.counts['UNCHANGED'] += 1
                continue
            kind = INSERT if old is None else UPDATE
            self.counts[kind] += 1
            # Both are written as an upsert, so a card the database already
            # has (first run, lost cache) is updated rather than duplicated.
            yield Operation(kind, card_id, row)
        self.removed = sorted(set(self.previous) - set(self.hashes))
        self.done = True


###################################################
# Reading and writing
###################################################

def iter_cards(path):
    """Stream cards out of a bulk file without loading it whole."""
    import ijson
    with open(path, 'rb') as f:
        yield from ijson.items(f, 'item', use_float=True)


def _batches(items, size):
    batch = []
    for item in items:
        batch.append(item)
        if len(batch) >= size:
            yield batch
            batch = []
    if batch:
        yield batch


def execute_upserts(conn, operations, batch_size=500):
    """Upsert streamed operations in batches, all in one transaction."""
    if batch_size < 1:
        raise ValueError('batch_size must be at least 1')
    sql = apply_diff.insert_sql()
    written = 0
    cursor = conn.cursor()
    try:
        for batch in _batches(operations, batch_size):
            cursor.executemany(sql, [apply_diff.insert_params(op)
                                     for op in batch])
            written += len(batch)
            logger.info('Upserted %d cards so far', written)
        conn.commit()
    except BaseException:
        conn.rollback()
        logger.exception('Card sync failed, rolled back')
        raise
    finally:
        cursor.close()
    return written


def connect_with_retry(url, attempts=5, delay=10, sleep=time.sleep):
    """Connect, retrying a few times (Neon can take a moment to wake up)."""
    url = db_updater.libpq_url(url)
    for attempt in range(1, attempts + 1):
        try:
            return db_updater.connect(url)
        except Exception as err:  # driver-specific OperationalError
            if attempt == attempts:
                raise
            logger.warning('Connect attempt %d failed (%s), retrying in %ds',
                           attempt, type(err).__name__, delay)
            sleep(delay)


###################################################
# Scryfall
###################################################

def find_bulk_entry(listing, bulk_type=BULK_TYPE):
    for entry in listing.get('data', []):
        if entry.get('type') == bulk_type:
            return entry
    raise LookupError(f'no {bulk_type} entry in the bulk-data listing')


def check_download_uri(uri):
    parts = urlsplit(uri)
    host = parts.hostname or ''
    if parts.scheme != 'https' or not host.endswith(DOWNLOAD_HOST_SUFFIXES):
        raise ValueError(f'unexpected bulk download host: {host!r}')
    return uri


def fetch_bulk_entry(bulk_type=BULK_TYPE):
    import requests
    response = requests.get(BULK_DATA_URL, headers=HEADERS, timeout=30)
    response.raise_for_status()
    return find_bulk_entry(response.json(), bulk_type)


def download(uri, out_path):
    import requests
    check_download_uri(uri)
    tmp = f"{out_path}.part"
    with requests.get(uri, headers=HEADERS, stream=True, timeout=60) as r:
        r.raise_for_status()
        with open(tmp, 'wb') as f:
            for chunk in r.iter_content(chunk_size=1 << 20):
                f.write(chunk)
    os.replace(tmp, out_path)
    logger.info('Downloaded %s (%d bytes)', out_path,
                os.path.getsize(out_path))


def write_github_output(values):
    path = os.environ.get('GITHUB_OUTPUT')
    if not path:
        return
    with open(path, 'a') as f:
        for key, value in values.items():
            f.write(f'{key}={value}\n')


###################################################
# Commands
###################################################

def cmd_check(args):
    entry = fetch_bulk_entry()
    updated_at = entry.get('updated_at', '')
    uri = check_download_uri(entry['download_uri'])
    last = load_state(args.state_dir).get('updated_at')
    changed = args.force or updated_at != last
    if changed:
        logger.info('Bulk file updated_at %s (last synced: %s)', updated_at,
                    last or 'never')
    else:
        logger.info('Bulk file unchanged since %s, nothing to do', last)
    write_github_output({'changed': str(changed).lower(),
                         'updated_at': updated_at,
                         'download_uri': uri})
    print(json.dumps({'changed': changed, 'updated_at': updated_at,
                      'download_uri': uri}))
    return 0


def cmd_download(args):
    download(args.uri, args.out)
    return 0


def cmd_apply(args, cards=None, connect=None):
    previous = {} if args.full else load_hashes(args.state_dir)
    if not previous:
        logger.info('No saved hashes, upserting every card')
    plan = SyncPlan(cards if cards is not None else iter_cards(args.cards),
                    previous)

    if args.dry_run:
        shown = 0
        for op in plan.operations():
            if shown < 20:
                print(f"{op.kind} {op.card_id} ({op.fields.get('name')})")
                shown += 1
    else:
        url = os.environ.get('DATABASE_URL')
        if not url:
            sys.exit('DATABASE_URL is not set.')
        conn = (connect or connect_with_retry)(url)
        try:
            execute_upserts(conn, plan.operations(), args.batch_size)
        finally:
            conn.close()

    counts = plan.counts
    summary = (f"{len(plan.hashes)} cards: {counts[INSERT]} new, "
               f"{counts[UPDATE]} changed, {counts['UNCHANGED']} unchanged, "
               f"{counts['SKIP']} skipped, {len(plan.removed)} removed "
               f"from Scryfall (left in place)")
    if plan.removed:
        logger.info('Removed from Scryfall: %s%s',
                    ', '.join(plan.removed[:20]),
                    ' ...' if len(plan.removed) > 20 else '')
    if args.dry_run:
        print(f'Dry run, nothing written. {summary}')
        return 0

    save_state(args.state_dir, plan.hashes, args.updated_at, len(plan.hashes))
    logger.info('Done. %s', summary)
    print(summary)
    return 0


def parse_args(argv):
    parser = argparse.ArgumentParser(
        description='Sync Scryfall bulk data into the Card table.')
    sub = parser.add_subparsers(dest='command', required=True)

    check = sub.add_parser('check', help='has the bulk file changed?')
    check.add_argument('--state-dir', default='state')
    check.add_argument('--force', action='store_true',
                       help='report changed even if updated_at matches')

    dl = sub.add_parser('download', help='download a bulk file')
    dl.add_argument('uri')
    dl.add_argument('--out', required=True)

    apply = sub.add_parser('apply', help='upsert new and changed cards')
    apply.add_argument('cards', help='Scryfall bulk file (JSON array)')
    apply.add_argument('--state-dir', default='state')
    apply.add_argument('--updated-at', default=None,
                       help="bulk entry's updated_at, saved for the next check")
    apply.add_argument('--dry-run', action='store_true',
                       help='print what would change, touch nothing')
    apply.add_argument('--full', action='store_true',
                       help='ignore saved hashes and upsert every card')
    apply.add_argument('--batch-size', type=int, default=500)

    args = parser.parse_args(argv)
    if getattr(args, 'batch_size', 1) < 1:
        parser.error('--batch-size must be at least 1')
    return args


def main(argv=None):
    logging.config.fileConfig(os.path.join(HERE, 'logger.conf'),
                              disable_existing_loggers=False)
    args = parse_args(argv)
    return {'check': cmd_check, 'download': cmd_download,
            'apply': cmd_apply}[args.command](args)


if __name__ == '__main__':
    sys.exit(main())
