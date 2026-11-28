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
# about 10 MB). Prices are hashed on their own (state/price_hashes.json) and
# written to the small CardPrice table, so a card whose price moved but
# nothing else changed doesn't rewrite its Card row. New and changed cards
# and prices are upserted in batches, all in one transaction; a row that
# already matches is left alone. With no saved hashes (first run, lost cache,
# or --full) every card is sent. With --prune, Card rows whose id isn't in the
# bulk file are deleted afterwards (their prices go with them), except any
# card a collection still references; those are kept and logged.
#
# State is only written after the database commit succeeds, and never on a
# dry run, so a failed or dry run leaves the next run to pick up the changes.
import argparse
import hashlib
import io
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
from apply_diff import INSERT, PRICE_FIELD, UPDATE, Operation

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
PRICE_HASHES_FILE = 'price_hashes.json'
# An operation for a card whose price changed and nothing else.
PRICE = 'PRICE'
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


def load_price_hashes(state_dir):
    return load_json(os.path.join(state_dir, PRICE_HASHES_FILE), {})


def save_state(state_dir, hashes, updated_at, card_count, price_hashes=None):
    os.makedirs(state_dir, exist_ok=True)
    write_json_atomic(os.path.join(state_dir, HASHES_FILE), hashes)
    write_json_atomic(os.path.join(state_dir, PRICE_HASHES_FILE),
                      price_hashes or {})
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

    Iterate ``operations()`` once; afterwards ``hashes`` and ``price_hashes``
    hold the new id -> hash maps and ``removed`` the ids that disappeared
    from Scryfall.

    Each operation's fields hold the Card columns when they changed (INSERT,
    UPDATE) and ``prices`` when the price changed; a PRICE operation has only
    ``prices``.
    """

    def __init__(self, cards, previous_hashes, previous_price_hashes=None):
        self._cards = cards
        self.previous = previous_hashes
        self.previous_prices = previous_price_hashes or {}
        self.hashes = {}
        self.price_hashes = {}
        self.counts = {INSERT: 0, UPDATE: 0, PRICE: 0, 'UNCHANGED': 0,
                       'SKIP': 0}
        self.removed = []
        # Every id in the file, skipped cards included, so prune keeps them.
        self.seen = set()
        self.done = False

    def operations(self):
        for card in self._cards:
            card_id = card.get('id') if isinstance(card, dict) else None
            if not card_id:
                self.counts['SKIP'] += 1
                logger.warning('Skipping a card with no id')
                continue
            self.seen.add(card_id)
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
            prices = apply_diff.price_row(card)
            price_digest = row_hash(prices)
            self.price_hashes[card_id] = price_digest
            old = self.previous.get(card_id)
            card_changed = old != digest
            price_changed = self.previous_prices.get(card_id) != price_digest
            if not card_changed and not price_changed:
                self.counts['UNCHANGED'] += 1
                continue
            if card_changed:
                kind = INSERT if old is None else UPDATE
                fields = dict(row)
            else:
                kind = PRICE
                fields = {}
            if price_changed:
                fields.update(prices)
            self.counts[kind] += 1
            # All are written as upserts, so a card the database already
            # has (first run, lost cache) is updated rather than duplicated.
            yield Operation(kind, card_id, fields)
        self.removed = sorted(set(self.previous) - set(self.hashes))
        self.done = True


###################################################
# Reading and writing
###################################################

def _open_bulk(path):
    """Open a bulk file, transparently un-gzipping it if needed."""
    with open(path, 'rb') as f:
        magic = f.read(2)
    if magic == b'\x1f\x8b':
        import gzip
        return gzip.open(path, 'rb')
    return open(path, 'rb')


def _first_byte(f):
    """The first non-whitespace byte, leaving the stream where it was."""
    while True:
        chunk = f.peek(64) if hasattr(f, 'peek') else b''
        stripped = chunk.lstrip()
        if stripped:
            return stripped[:1]
        if not chunk:
            return b''
        f.read(len(chunk))


def iter_cards(path):
    """Stream cards out of a bulk file without loading it whole.

    Handles both Scryfall formats: a JSON array (download_uri) and JSON Lines,
    one card per line (jsonl_download_uri), gzipped or not.
    """
    with _open_bulk(path) as raw:
        f = raw if hasattr(raw, 'peek') else io.BufferedReader(raw)
        if _first_byte(f) == b'[':
            import ijson
            yield from ijson.items(f, 'item', use_float=True)
            return
        for line in f:
            line = line.strip()
            if line:
                yield json.loads(line)


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
    card_sql = apply_diff.insert_sql()
    price_sql = apply_diff.price_upsert_sql()
    written = 0
    cursor = conn.cursor()
    try:
        for batch in _batches(operations, batch_size):
            cards = [op for op in batch if op.kind in (INSERT, UPDATE)]
            prices = [op for op in batch if PRICE_FIELD in op.fields]
            if cards:
                cursor.executemany(card_sql, [apply_diff.insert_params(op)
                                              for op in cards])
            # After the cards, so a new card's price has its card.
            if prices:
                cursor.executemany(price_sql, [apply_diff.price_params(op)
                                               for op in prices])
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


# A bulk file this small is broken or truncated (the real one has ~120k
# cards), so prune refuses rather than deleting most of the table.
PRUNE_MIN_KEEP = 50000

PRUNE_FIND_SQL = '''
SELECT c.id, c.name,
       EXISTS (SELECT 1 FROM "CardsOnCollections" e WHERE e."cardId" = c.id)
       OR EXISTS (SELECT 1 FROM "Collection" k WHERE c.id = ANY(k.cards))
FROM "Card" c
WHERE NOT EXISTS (SELECT 1 FROM sync_keep_ids k WHERE k.id = c.id)
ORDER BY c.name, c.id
'''

# Re-checks references at delete time, so a card added to a collection
# between the SELECT and the DELETE is still kept.
PRUNE_DELETE_SQL = '''
DELETE FROM "Card" c
WHERE c.id = ANY(%s::text[])
  AND NOT EXISTS (SELECT 1 FROM "CardsOnCollections" e WHERE e."cardId" = c.id)
  AND NOT EXISTS (SELECT 1 FROM "Collection" k WHERE c.id = ANY(k.cards))
'''


def prune_missing(conn, keep_ids, dry_run=False, min_keep=PRUNE_MIN_KEEP):
    """Delete Card rows whose id isn't in keep_ids, unless a collection uses them.

    Returns (deleted, would_delete, kept_in_collections). kept_in_collections
    is a list of (id, name). On a dry run nothing is deleted and deleted is 0.
    """
    if len(keep_ids) < min_keep:
        raise RuntimeError(
            f'Refusing to prune: the bulk file only had {len(keep_ids)} cards '
            f'(expected at least {min_keep})')
    cursor = conn.cursor()
    try:
        cursor.execute('CREATE TEMP TABLE sync_keep_ids ON COMMIT DROP AS '
                       'SELECT unnest(%s::text[]) AS id', (sorted(keep_ids),))
        cursor.execute('ANALYZE sync_keep_ids')
        cursor.execute(PRUNE_FIND_SQL)
        rows = cursor.fetchall()
        kept = [(card_id, name) for card_id, name, used in rows if used]
        doomed = [card_id for card_id, _name, used in rows if not used]
        for card_id, name in kept:
            logger.warning('Keeping %s (%s): not in the bulk file, but a '
                           'collection has it', card_id, name)
        deleted = 0
        if doomed and not dry_run:
            cursor.execute(PRUNE_DELETE_SQL, (doomed,))
            deleted = cursor.rowcount
        if dry_run:
            conn.rollback()
        else:
            conn.commit()
    except BaseException:
        conn.rollback()
        logger.exception('Prune failed, rolled back')
        raise
    finally:
        cursor.close()
    return deleted, len(doomed), kept


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


def bulk_type_url(bulk_type=BULK_TYPE):
    """The single-type endpoint, e.g. /bulk-data/default-cards."""
    return f"{BULK_DATA_URL}/{bulk_type.replace('_', '-')}"


def fetch_bulk_entry(bulk_type=BULK_TYPE, get=None):
    """Return the bulk-data object for bulk_type, with its download_uri.

    The listing at /bulk-data doesn't always carry download_uri, so when it's
    missing, read the single-type object (/bulk-data/default-cards), which is
    what the seed and the older broker scripts use.
    """
    if get is None:
        import requests
        get = requests.get

    def fetch(url):
        response = get(url, headers=HEADERS, timeout=30)
        response.raise_for_status()
        return response.json()

    entry = find_bulk_entry(fetch(BULK_DATA_URL), bulk_type)
    uri = bulk_download_uri(entry)
    if not uri:
        logger.info('Listing entry has no download link (keys: %s), reading %s',
                    sorted(entry), bulk_type_url(bulk_type))
        entry = {**entry, **fetch(bulk_type_url(bulk_type))}
        uri = bulk_download_uri(entry)
    if not uri:
        raise LookupError(
            f'no download link for {bulk_type} (keys: {sorted(entry)})')
    return {**entry, 'download_uri': uri}


def bulk_download_uri(entry):
    """Scryfall now offers JSON Lines (jsonl_download_uri); older objects had
    a JSON array at download_uri. iter_cards reads either."""
    return entry.get('download_uri') or entry.get('jsonl_download_uri')


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
    previous_prices = {} if args.full else load_price_hashes(args.state_dir)
    if not previous:
        logger.info('No saved hashes, upserting every card')
    plan = SyncPlan(cards if cards is not None else iter_cards(args.cards),
                    previous, previous_prices)

    url = os.environ.get('DATABASE_URL')
    prune = None
    if args.dry_run:
        shown = 0
        for op in plan.operations():
            if shown < 20:
                name = op.fields.get('name')
                print(f"{op.kind} {op.card_id}" + (f" ({name})" if name else ''))
                shown += 1
        if args.prune and url:
            conn = (connect or connect_with_retry)(url)
            try:
                prune = prune_missing(conn, plan.seen, dry_run=True)
            finally:
                conn.close()
        elif args.prune:
            print('No DATABASE_URL, so the dry run skips the prune check.')
    else:
        if not url:
            sys.exit('DATABASE_URL is not set.')
        conn = (connect or connect_with_retry)(url)
        try:
            execute_upserts(conn, plan.operations(), args.batch_size)
            if args.prune:
                prune = prune_missing(conn, plan.seen)
        finally:
            conn.close()

    counts = plan.counts
    summary = (f"{len(plan.hashes)} cards: {counts[INSERT]} new, "
               f"{counts[UPDATE]} changed, {counts[PRICE]} with only a new "
               f"price, {counts['UNCHANGED']} unchanged, "
               f"{counts['SKIP']} skipped, {len(plan.removed)} removed "
               f"from Scryfall since the last run")
    if prune is not None:
        deleted, would_delete, kept = prune
        if args.dry_run:
            summary += (f". Prune would delete {would_delete} cards not in "
                        f"the bulk file and keep {len(kept)} that are in a "
                        f"collection")
        else:
            summary += (f". Pruned {deleted} cards not in the bulk file, "
                        f"kept {len(kept)} that are in a collection")
    if plan.removed:
        logger.info('Removed from Scryfall: %s%s',
                    ', '.join(plan.removed[:20]),
                    ' ...' if len(plan.removed) > 20 else '')
    if args.dry_run:
        print(f'Dry run, nothing written. {summary}')
        return 0

    save_state(args.state_dir, plan.hashes, args.updated_at, len(plan.hashes),
               plan.price_hashes)
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
    apply.add_argument('--prune', action='store_true',
                       help="delete cards that aren't in the bulk file, "
                            'except ones a collection uses')
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
