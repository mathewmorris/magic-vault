"""Turn a DeepDiff result into database operations for the Card table.

The planning half of this module is pure: it takes plain dicts shaped like
DeepDiff's output (``DeepDiff(old, new, group_by='id', verbose_level=2)``,
either the live object's ``to_dict()`` or the JSON written to ``events/``)
and returns a list of ``Operation`` values. Nothing here needs DeepDiff or a
database, so it can be tested with small fake dicts.

The execution half takes any DB-API 2.0 connection that uses ``%s``
placeholders (psycopg 3 or psycopg2) and runs the operations in batches,
inside one transaction.
"""

import json
import logging
from dataclasses import dataclass, field
from typing import Any, Dict, Iterable, List, Optional, Tuple

logger = logging.getLogger(__name__)

INSERT = "INSERT"
UPDATE = "UPDATE"
SKIP = "SKIP"

TABLE = '"Card"'

# Columns the Card table stores (see prisma/schema.prisma), besides "id".
STORED_FIELDS = (
    "name",
    "scryfall_uri",
    "image_status",
    "image_uris",
    "card_faces",
    "all_parts",
    "layout",
)
REQUIRED_FIELDS = ("name", "scryfall_uri", "image_status", "layout")
JSON_FIELDS = ("image_uris", "card_faces", "all_parts")

# Report types whose entries carry the new value, and where to find it.
_NEW_VALUE_KEYS = {
    "values_changed": "new_value",
    "type_changes": "new_value",
}

REMOVED_REASON = (
    "card was removed from Scryfall; the Card table has no soft-delete "
    "column, so the row is left in place"
)


@dataclass(frozen=True)
class Operation:
    kind: str
    card_id: Optional[str]
    fields: Dict[str, Any] = field(default_factory=dict)
    reason: str = ""


def parse_path(path: str) -> List[Any]:
    """Split a DeepDiff path like ``root['abc']['prices'][0]`` into keys."""
    if not path.startswith("root"):
        raise ValueError(f"not a DeepDiff path: {path!r}")
    keys: List[Any] = []
    i = len("root")
    while i < len(path):
        if path[i] != "[":
            raise ValueError(f"unexpected {path[i]!r} at {i} in {path!r}")
        i += 1
        if i < len(path) and path[i] in "'\"":
            quote = path[i]
            end = path.find(quote + "]", i + 1)
            if end == -1:
                raise ValueError(f"unterminated key in {path!r}")
            keys.append(path[i + 1:end])
            i = end + 2
        else:
            end = path.find("]", i)
            if end == -1:
                raise ValueError(f"unterminated index in {path!r}")
            keys.append(int(path[i:end]))
            i = end + 1
    return keys


def _entries(report: Any) -> Iterable[Tuple[str, Any, bool]]:
    """Yield (path, detail, has_detail) for one report type.

    With verbose_level=2 a report is a dict of path -> detail. With lower
    verbosity some reports are just a list of paths, so there is no value.
    """
    if isinstance(report, dict):
        for path, detail in report.items():
            yield path, detail, True
    else:
        for path in report:
            yield path, None, False


def card_to_row(card_id: str, card: Dict[str, Any]) -> Dict[str, Any]:
    """Pick out the columns the Card table stores from a Scryfall card."""
    row = {"id": card_id}
    for name in STORED_FIELDS:
        row[name] = card.get(name)
    return row


def _missing_required(row: Dict[str, Any]) -> List[str]:
    return [name for name in REQUIRED_FIELDS
            if name in row and row[name] is None]


def plan_operations(
    diff: Dict[str, Any],
    new_cards_by_id: Optional[Dict[str, Dict[str, Any]]] = None,
) -> List[Operation]:
    """Turn a DeepDiff result into insert/update/skip operations.

    ``diff`` must come from ``DeepDiff(old_cards, new_cards, group_by='id')``
    so "added" means new on Scryfall. ``new_cards_by_id`` is optional; when
    given, updates use the full new value of each changed column, which is
    needed when the change is nested (``image_uris['small']``) or inside a
    list (``card_faces[0]``). Without it those cards are skipped.

    Changes that only touch columns we don't store (prices, ranks, ...) make
    no operation at all.
    """
    inserts: List[Operation] = []
    skips: List[Operation] = []
    inserted_or_removed = set()
    # card_id -> {column: (resolved, value)}
    touched: Dict[str, Dict[str, Tuple[bool, Any]]] = {}

    for report_type, report in diff.items():
        for path, detail, has_detail in _entries(report):
            try:
                keys = parse_path(path)
            except ValueError as err:
                skips.append(Operation(SKIP, None, reason=str(err)))
                continue
            if not keys or not isinstance(keys[0], str):
                skips.append(Operation(
                    SKIP, None, reason=f"path has no card id: {path}"))
                continue
            card_id = keys[0]

            if len(keys) == 1:
                inserted_or_removed.add(card_id)
                if report_type == "dictionary_item_added":
                    op = _plan_insert(card_id, detail if has_detail else None,
                                      new_cards_by_id)
                    (inserts if op.kind == INSERT else skips).append(op)
                elif report_type == "dictionary_item_removed":
                    skips.append(Operation(SKIP, card_id,
                                           reason=REMOVED_REASON))
                else:
                    skips.append(Operation(
                        SKIP, card_id,
                        reason=f"no handling for whole-card {report_type}"))
                continue

            column = keys[1]
            if column not in STORED_FIELDS:
                continue
            columns = touched.setdefault(card_id, {})
            _record_change(columns, column, report_type, len(keys) == 2,
                           detail, has_detail)

    updates: List[Operation] = []
    for card_id, columns in touched.items():
        if card_id in inserted_or_removed:
            continue
        op = _plan_update(card_id, columns, new_cards_by_id)
        (updates if op.kind == UPDATE else skips).append(op)

    return inserts + updates + skips


def _record_change(columns, column, report_type, top_level, detail,
                   has_detail) -> None:
    """Note the new value of one column, or that we can't know it."""
    if columns.get(column, (True, None))[0] is False:
        return  # already needs the full new card, nothing changes that
    if top_level and has_detail and report_type in _NEW_VALUE_KEYS:
        columns[column] = (True, detail.get(_NEW_VALUE_KEYS[report_type]))
    elif top_level and has_detail and report_type == "dictionary_item_added":
        columns[column] = (True, detail)
    elif top_level and report_type == "dictionary_item_removed":
        columns[column] = (True, None)
    else:
        # Nested or list change: only the full new card can tell us the
        # column's whole new value.
        columns[column] = (False, None)


def _plan_insert(card_id, card, new_cards_by_id) -> Operation:
    if card is None and new_cards_by_id is not None:
        card = new_cards_by_id.get(card_id)
    if not isinstance(card, dict):
        return Operation(SKIP, card_id,
                         reason="new card but its data isn't in the diff")
    row = card_to_row(card_id, card)
    missing = _missing_required(row)
    if missing:
        return Operation(
            SKIP, card_id,
            reason=f"new card is missing required {', '.join(missing)}")
    return Operation(INSERT, card_id, row)


def _plan_update(card_id, columns, new_cards_by_id) -> Operation:
    new_card = (new_cards_by_id or {}).get(card_id)
    values: Dict[str, Any] = {}
    unresolved = []
    for column in STORED_FIELDS:
        if column not in columns:
            continue
        if new_card is not None:
            values[column] = new_card.get(column)
            continue
        resolved, value = columns[column]
        if resolved:
            values[column] = value
        else:
            unresolved.append(column)
    if unresolved:
        return Operation(
            SKIP, card_id,
            reason=("nested change to " + ", ".join(unresolved)
                    + " needs the new card data (pass --cards)"))
    missing = _missing_required(values)
    if missing:
        return Operation(
            SKIP, card_id,
            reason=f"update would null required {', '.join(missing)}")
    return Operation(UPDATE, card_id, values)


def summarize(operations: Iterable[Operation]) -> Dict[str, int]:
    counts = {INSERT: 0, UPDATE: 0, SKIP: 0}
    for op in operations:
        counts[op.kind] = counts.get(op.kind, 0) + 1
    return counts


def describe_operation(op: Operation) -> str:
    """One line for logs and --dry-run output."""
    if op.kind == INSERT:
        return f"INSERT {op.card_id} ({op.fields.get('name')})"
    if op.kind == UPDATE:
        return f"UPDATE {op.card_id} set {', '.join(op.fields)}"
    return f"SKIP {op.card_id or '?'}: {op.reason}"


###################################################
# Executing against Postgres
###################################################

def _quote(column: str) -> str:
    return f'"{column}"'


def _placeholder(column: str) -> str:
    return "%s::jsonb" if column in JSON_FIELDS else "%s"


def _param(column: str, value: Any) -> Any:
    if column in JSON_FIELDS and value is not None:
        return json.dumps(value)
    return value


def insert_sql() -> str:
    columns = ("id",) + STORED_FIELDS
    names = ", ".join(_quote(c) for c in columns)
    values = ", ".join(_placeholder(c) for c in columns)
    updates = ", ".join(f"{_quote(c)} = EXCLUDED.{_quote(c)}"
                        for c in STORED_FIELDS)
    return (f"INSERT INTO {TABLE} ({names}) VALUES ({values}) "
            f'ON CONFLICT ("id") DO UPDATE SET {updates}')


def insert_params(op: Operation) -> Tuple[Any, ...]:
    columns = ("id",) + STORED_FIELDS
    return tuple(_param(c, op.fields.get(c)) for c in columns)


def update_sql(columns: Tuple[str, ...]) -> str:
    sets = ", ".join(f"{_quote(c)} = {_placeholder(c)}" for c in columns)
    return f'UPDATE {TABLE} SET {sets} WHERE "id" = %s'


def update_params(op: Operation, columns: Tuple[str, ...]) -> Tuple[Any, ...]:
    return tuple(_param(c, op.fields[c]) for c in columns) + (op.card_id,)


def _batches(items: List[Any], size: int) -> Iterable[List[Any]]:
    for start in range(0, len(items), size):
        yield items[start:start + size]


def execute_operations(conn, operations: List[Operation],
                       batch_size: int = 500) -> Dict[str, int]:
    """Run inserts and updates in batches, all in one transaction.

    Commits only if every batch succeeds; any error rolls everything back
    and is re-raised. Skips are logged, never written.
    """
    if batch_size < 1:
        raise ValueError("batch_size must be at least 1")

    inserts = [op for op in operations if op.kind == INSERT]
    updates_by_columns: Dict[Tuple[str, ...], List[Operation]] = {}
    for op in operations:
        if op.kind == UPDATE:
            columns = tuple(c for c in STORED_FIELDS if c in op.fields)
            updates_by_columns.setdefault(columns, []).append(op)
        elif op.kind == SKIP:
            logger.info(describe_operation(op))

    cursor = conn.cursor()
    try:
        sql = insert_sql()
        for batch in _batches(inserts, batch_size):
            cursor.executemany(sql, [insert_params(op) for op in batch])
            logger.info("Inserted batch of %d cards", len(batch))
        for columns, ops in updates_by_columns.items():
            sql = update_sql(columns)
            for batch in _batches(ops, batch_size):
                cursor.executemany(
                    sql, [update_params(op, columns) for op in batch])
                logger.info("Updated batch of %d cards (%s)",
                            len(batch), ", ".join(columns))
        conn.commit()
    except Exception:
        conn.rollback()
        logger.exception("Database update failed, rolled back")
        raise
    finally:
        cursor.close()

    return summarize(operations)
