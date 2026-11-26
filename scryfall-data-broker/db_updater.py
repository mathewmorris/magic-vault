###################################################
# Update database
###################################################
# Apply a diff from the card differ to the Card table.
#
#   python db_updater.py events/events_2024_10_10.json --dry-run
#   python db_updater.py events/events_2024_10_10.json \
#       --cards scryfall_downloads/default_cards_2024_10_10.json
#
# --dry-run prints what it would do and never connects to a database.
# Otherwise it reads DATABASE_URL and needs psycopg (3) or psycopg2.
import argparse
import json
import logging
import logging.config
import os
import sys
from datetime import datetime
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

import apply_diff

HERE = os.path.dirname(os.path.abspath(__file__))
logger = logging.getLogger('db_updater')

# Query parameters Prisma understands that libpq rejects.
PRISMA_ONLY_PARAMS = {'schema', 'connection_limit', 'pool_timeout',
                      'pgbouncer', 'statement_cache_size', 'socket_timeout'}


def libpq_url(url):
    """Drop Prisma-only query parameters so psycopg accepts the URL."""
    parts = urlsplit(url)
    query = [(k, v) for k, v in parse_qsl(parts.query)
             if k not in PRISMA_ONLY_PARAMS]
    return urlunsplit(parts._replace(query=urlencode(query)))


def connect(url):
    try:
        import psycopg
        return psycopg.connect(url)
    except ImportError:
        pass
    try:
        import psycopg2
        return psycopg2.connect(url)
    except ImportError:
        sys.exit('No Postgres driver found. Install psycopg or psycopg2, '
                 'or use --dry-run.')


def load_cards_by_id(path):
    with open(path, 'r') as f:
        return {card['id']: card for card in json.load(f)}


def parse_args(argv):
    today = datetime.today().strftime('%Y_%m_%d')
    parser = argparse.ArgumentParser(
        description='Apply a card diff to the Card table.')
    parser.add_argument('events', nargs='?',
                        default=os.path.join('events', f'events_{today}.json'),
                        help='diff JSON written by the card differ')
    parser.add_argument('--cards',
                        help='new Scryfall bulk file, needed for nested '
                             'changes (image_uris, card_faces, all_parts)')
    parser.add_argument('--dry-run', action='store_true',
                        help='print what would happen, touch nothing')
    parser.add_argument('--batch-size', type=int, default=500)
    args = parser.parse_args(argv)
    if args.batch_size < 1:
        parser.error('--batch-size must be at least 1')
    return args


def main(argv=None):
    logging.config.fileConfig(os.path.join(HERE, 'logger.conf'),
                              disable_existing_loggers=False)
    args = parse_args(argv)

    with open(args.events, 'r') as f:
        diff = json.load(f)
    new_cards = load_cards_by_id(args.cards) if args.cards else None

    operations = apply_diff.plan_operations(diff, new_cards)
    counts = apply_diff.summarize(operations)
    logger.info('Planned %d inserts, %d updates, %d skips from %s',
                counts['INSERT'], counts['UPDATE'], counts['SKIP'],
                args.events)

    if args.dry_run:
        for op in operations:
            print(apply_diff.describe_operation(op))
        print(f"Dry run: would insert {counts['INSERT']}, update "
              f"{counts['UPDATE']}, skip {counts['SKIP']}. Nothing written.")
        return 0

    url = os.environ.get('DATABASE_URL')
    if not url:
        sys.exit('DATABASE_URL is not set.')
    conn = connect(libpq_url(url))
    try:
        apply_diff.execute_operations(conn, operations, args.batch_size)
    finally:
        conn.close()
    logger.info('Done: inserted %d, updated %d, skipped %d',
                counts['INSERT'], counts['UPDATE'], counts['SKIP'])
    return 0


if __name__ == '__main__':
    sys.exit(main())
