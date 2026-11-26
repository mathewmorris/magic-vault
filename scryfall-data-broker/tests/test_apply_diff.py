import io
import json
import os
import tempfile
import unittest
from contextlib import redirect_stdout
from unittest import mock

import apply_diff
import db_updater
from apply_diff import INSERT, SKIP, UPDATE, Operation

FOREST_ID = "0000419b-0bba-4488-8f7a-6194544ce91e"
BEAR_ID = "1111aaaa-0000-0000-0000-000000000001"
GONE_ID = "2222bbbb-0000-0000-0000-000000000002"


def fake_card(name="Forest", **overrides):
    # group_by='id' pops "id" out of each card, so diff values have none.
    card = {
        "object": "card",
        "name": name,
        "scryfall_uri": f"https://scryfall.com/card/x/1/{name.lower()}",
        "image_status": "highres_scan",
        "image_uris": {"small": "s.jpg", "normal": "n.jpg"},
        "layout": "normal",
        "prices": {"usd": "0.21"},
        "edhrec_rank": 100,
    }
    card.update(overrides)
    return card


def path(*keys):
    return "root" + "".join(
        f"[{k}]" if isinstance(k, int) else f"['{k}']" for k in keys)


class ParsePathTest(unittest.TestCase):
    def test_splits_keys_and_indexes(self):
        self.assertEqual(
            apply_diff.parse_path("root['abc']['card_faces'][0]['name']"),
            ["abc", "card_faces", 0, "name"])

    def test_double_quoted_key(self):
        self.assertEqual(apply_diff.parse_path('root["it\'s"]'), ["it's"])

    def test_rejects_garbage(self):
        with self.assertRaises(ValueError):
            apply_diff.parse_path("nope['abc']")
        with self.assertRaises(ValueError):
            apply_diff.parse_path("root['abc")


class PlanOperationsTest(unittest.TestCase):
    def test_added_card_becomes_insert_with_stored_fields_only(self):
        diff = {"dictionary_item_added": {path(BEAR_ID): fake_card("Bear")}}
        [op] = apply_diff.plan_operations(diff)
        self.assertEqual(op.kind, INSERT)
        self.assertEqual(op.card_id, BEAR_ID)
        self.assertEqual(op.fields["id"], BEAR_ID)
        self.assertEqual(op.fields["name"], "Bear")
        self.assertEqual(op.fields["image_uris"],
                         {"small": "s.jpg", "normal": "n.jpg"})
        self.assertIsNone(op.fields["card_faces"])
        self.assertNotIn("prices", op.fields)
        self.assertEqual(set(op.fields),
                         {"id"} | set(apply_diff.STORED_FIELDS))

    def test_added_card_missing_required_field_is_skipped(self):
        card = fake_card("Bear")
        del card["layout"]
        diff = {"dictionary_item_added": {path(BEAR_ID): card}}
        [op] = apply_diff.plan_operations(diff)
        self.assertEqual(op.kind, SKIP)
        self.assertIn("layout", op.reason)

    def test_added_card_from_path_list_uses_new_cards_lookup(self):
        diff = {"dictionary_item_added": [path(BEAR_ID)]}
        [skipped] = apply_diff.plan_operations(diff)
        self.assertEqual(skipped.kind, SKIP)
        lookup = {BEAR_ID: dict(fake_card("Bear"), id=BEAR_ID)}
        [op] = apply_diff.plan_operations(diff, lookup)
        self.assertEqual(op.kind, INSERT)
        self.assertEqual(op.fields["name"], "Bear")

    def test_removed_card_is_skipped_not_deleted(self):
        diff = {"dictionary_item_removed": {path(GONE_ID): fake_card()}}
        [op] = apply_diff.plan_operations(diff)
        self.assertEqual(op.kind, SKIP)
        self.assertEqual(op.card_id, GONE_ID)
        self.assertIn("soft-delete", op.reason)

    def test_changes_to_unstored_fields_make_no_operations(self):
        diff = {"values_changed": {
            path(FOREST_ID, "prices", "usd"):
                {"new_value": "0.21", "old_value": "0.22"},
            path(FOREST_ID, "edhrec_rank"):
                {"new_value": 8189, "old_value": 8195},
        }}
        self.assertEqual(apply_diff.plan_operations(diff), [])

    def test_real_events_file_only_has_price_and_rank_changes(self):
        here = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        with open(os.path.join(here, "events", "events_2024_10_10.json")) as f:
            diff = json.load(f)
        self.assertEqual(apply_diff.plan_operations(diff), [])

    def test_top_level_value_change_becomes_update(self):
        diff = {"values_changed": {
            path(FOREST_ID, "image_status"):
                {"new_value": "highres_scan", "old_value": "lowres"},
            path(FOREST_ID, "name"):
                {"new_value": "Forest", "old_value": "Forrest"},
            path(FOREST_ID, "prices", "usd"):
                {"new_value": "0.21", "old_value": "0.22"},
        }}
        [op] = apply_diff.plan_operations(diff)
        self.assertEqual(op, Operation(UPDATE, FOREST_ID, {
            "name": "Forest", "image_status": "highres_scan"}))

    def test_type_change_and_new_key_become_update(self):
        diff = {
            "type_changes": {path(FOREST_ID, "image_uris"): {
                "old_type": "NoneType", "new_type": "dict",
                "old_value": None, "new_value": {"small": "s.jpg"}}},
            "dictionary_item_added": {
                path(FOREST_ID, "all_parts"): [{"name": "Token"}]},
            "dictionary_item_removed": {
                path(FOREST_ID, "card_faces"): [{"name": "Old face"}]},
        }
        [op] = apply_diff.plan_operations(diff)
        self.assertEqual(op.kind, UPDATE)
        self.assertEqual(op.fields, {
            "image_uris": {"small": "s.jpg"},
            "card_faces": None,
            "all_parts": [{"name": "Token"}],
        })

    def test_nested_change_without_new_cards_is_skipped(self):
        diff = {"values_changed": {
            path(FOREST_ID, "image_uris", "small"):
                {"new_value": "s2.jpg", "old_value": "s.jpg"},
            path(FOREST_ID, "name"):
                {"new_value": "Forest", "old_value": "Forrest"},
        }}
        [op] = apply_diff.plan_operations(diff)
        self.assertEqual(op.kind, SKIP)
        self.assertIn("image_uris", op.reason)

    def test_nested_change_uses_full_value_from_new_cards(self):
        diff = {
            "values_changed": {path(FOREST_ID, "image_uris", "small"):
                               {"new_value": "s2.jpg", "old_value": "s.jpg"}},
            "iterable_item_added": {path(FOREST_ID, "card_faces", 1):
                                    {"name": "Back"}},
        }
        new_card = fake_card(
            image_uris={"small": "s2.jpg", "normal": "n.jpg"},
            card_faces=[{"name": "Front"}, {"name": "Back"}])
        [op] = apply_diff.plan_operations(diff, {FOREST_ID: new_card})
        self.assertEqual(op.kind, UPDATE)
        self.assertEqual(op.fields, {
            "image_uris": {"small": "s2.jpg", "normal": "n.jpg"},
            "card_faces": [{"name": "Front"}, {"name": "Back"}],
        })

    def test_nulling_a_required_field_is_skipped(self):
        diff = {"dictionary_item_removed": {path(FOREST_ID, "layout"): "x"}}
        [op] = apply_diff.plan_operations(diff)
        self.assertEqual(op.kind, SKIP)
        self.assertIn("layout", op.reason)

    def test_bad_path_is_skipped(self):
        diff = {"values_changed": {"oops": {"new_value": 1}}}
        [op] = apply_diff.plan_operations(diff)
        self.assertEqual(op.kind, SKIP)
        self.assertIsNone(op.card_id)

    def test_mixed_diff_orders_inserts_updates_skips(self):
        diff = {
            "dictionary_item_removed": {path(GONE_ID): fake_card()},
            "values_changed": {path(FOREST_ID, "layout"):
                               {"new_value": "token", "old_value": "normal"}},
            "dictionary_item_added": {path(BEAR_ID): fake_card("Bear")},
        }
        ops = apply_diff.plan_operations(diff)
        self.assertEqual([op.kind for op in ops], [INSERT, UPDATE, SKIP])
        self.assertEqual(apply_diff.summarize(ops),
                         {INSERT: 1, UPDATE: 1, SKIP: 1})


class FakeCursor:
    def __init__(self, fail_on_call=None):
        self.calls = []
        self.closed = False
        self.fail_on_call = fail_on_call

    def executemany(self, sql, params):
        self.calls.append((sql, list(params)))
        if self.fail_on_call == len(self.calls):
            raise RuntimeError("boom")

    def close(self):
        self.closed = True


class FakeConnection:
    def __init__(self, cursor):
        self._cursor = cursor
        self.committed = False
        self.rolled_back = False

    def cursor(self):
        return self._cursor

    def commit(self):
        self.committed = True

    def rollback(self):
        self.rolled_back = True


def insert_op(card_id, name="Bear"):
    return Operation(INSERT, card_id,
                     apply_diff.card_to_row(card_id, fake_card(name)))


class ExecuteOperationsTest(unittest.TestCase):
    def test_batches_inserts_and_groups_updates_in_one_transaction(self):
        ops = [insert_op(f"id-{i}") for i in range(5)] + [
            Operation(UPDATE, "u1", {"name": "A"}),
            Operation(UPDATE, "u2", {"name": "B"}),
            Operation(UPDATE, "u3", {"layout": "token",
                                     "image_uris": {"small": "s"}}),
            Operation(SKIP, "gone", reason="removed"),
        ]
        cursor = FakeCursor()
        conn = FakeConnection(cursor)
        counts = apply_diff.execute_operations(conn, ops, batch_size=2)

        self.assertTrue(conn.committed)
        self.assertFalse(conn.rolled_back)
        self.assertTrue(cursor.closed)
        self.assertEqual(counts, {INSERT: 5, UPDATE: 3, SKIP: 1})

        insert_calls = [c for c in cursor.calls if c[0].startswith("INSERT")]
        self.assertEqual([len(p) for _, p in insert_calls], [2, 2, 1])
        self.assertIn('ON CONFLICT ("id")', insert_calls[0][0])

        update_calls = [c for c in cursor.calls if c[0].startswith("UPDATE")]
        self.assertEqual(len(update_calls), 2)
        name_sql, name_params = update_calls[0]
        self.assertEqual(name_sql,
                         'UPDATE "Card" SET "name" = %s WHERE "id" = %s')
        self.assertEqual(name_params, [("A", "u1"), ("B", "u2")])
        mixed_sql, mixed_params = update_calls[1]
        self.assertEqual(
            mixed_sql,
            'UPDATE "Card" SET "image_uris" = %s::jsonb, "layout" = %s '
            'WHERE "id" = %s')
        self.assertEqual(mixed_params, [('{"small": "s"}', "token", "u3")])
        self.assertFalse(any("DELETE" in sql for sql, _ in cursor.calls))

    def test_insert_params_carry_gameplay_and_printing_fields(self):
        card = fake_card("Bear", oracle_id="o-1", mana_cost="{1}{G}", cmc=2.0,
                         type_line="Creature — Bear", set="2ed",
                         collector_number="190", color_identity=["G"],
                         legalities={"vintage": "legal"})
        op = Operation(INSERT, "x", apply_diff.card_to_row("x", card))
        by_column = dict(zip(("id",) + apply_diff.STORED_FIELDS,
                             apply_diff.insert_params(op)))
        self.assertEqual(by_column["oracle_id"], "o-1")
        self.assertEqual(by_column["cmc"], 2.0)
        self.assertEqual(by_column["set"], "2ed")
        self.assertEqual(json.loads(by_column["color_identity"]), ["G"])
        self.assertEqual(json.loads(by_column["legalities"]),
                         {"vintage": "legal"})
        self.assertIsNone(by_column["power"])
        self.assertIn('"set" = EXCLUDED."set"', apply_diff.insert_sql())
        self.assertIn("%s::jsonb", apply_diff.insert_sql())

    def test_insert_params_serialize_json_and_keep_nulls(self):
        params = apply_diff.insert_params(insert_op("x"))
        columns = ("id",) + apply_diff.STORED_FIELDS
        by_column = dict(zip(columns, params))
        self.assertEqual(json.loads(by_column["image_uris"]),
                         {"small": "s.jpg", "normal": "n.jpg"})
        self.assertIsNone(by_column["card_faces"])
        self.assertEqual(by_column["name"], "Bear")

    def test_error_rolls_back_and_does_not_commit(self):
        ops = [insert_op("a"), insert_op("b")]
        cursor = FakeCursor(fail_on_call=2)
        conn = FakeConnection(cursor)
        with self.assertLogs("apply_diff", level="ERROR"):
            with self.assertRaises(RuntimeError):
                apply_diff.execute_operations(conn, ops, batch_size=1)
        self.assertTrue(conn.rolled_back)
        self.assertFalse(conn.committed)
        self.assertTrue(cursor.closed)

    def test_only_skips_writes_nothing(self):
        cursor = FakeCursor()
        conn = FakeConnection(cursor)
        apply_diff.execute_operations(
            conn, [Operation(SKIP, "x", reason="removed")])
        self.assertEqual(cursor.calls, [])

    def test_rejects_bad_batch_size(self):
        with self.assertRaises(ValueError):
            apply_diff.execute_operations(
                FakeConnection(FakeCursor()), [], batch_size=0)


class DbUpdaterTest(unittest.TestCase):
    def test_libpq_url_drops_prisma_params(self):
        self.assertEqual(
            db_updater.libpq_url(
                "postgresql://u:p@db:5432/mv?schema=public&sslmode=require"),
            "postgresql://u:p@db:5432/mv?sslmode=require")
        self.assertEqual(db_updater.libpq_url("postgresql://u:p@db/mv"),
                         "postgresql://u:p@db/mv")

    def test_dry_run_prints_plan_and_never_connects(self):
        diff = {
            "dictionary_item_added": {path(BEAR_ID): fake_card("Bear")},
            "dictionary_item_removed": {path(GONE_ID): fake_card()},
        }
        with tempfile.TemporaryDirectory() as tmp:
            events = os.path.join(tmp, "events.json")
            with open(events, "w") as f:
                json.dump(diff, f)
            out = io.StringIO()
            with mock.patch.object(db_updater, "connect") as connect, \
                    mock.patch.dict(os.environ,
                                    {"DATABASE_URL": "postgresql://x/y"}), \
                    redirect_stdout(out):
                db_updater.main([events, "--dry-run"])
        connect.assert_not_called()
        text = out.getvalue()
        self.assertIn(f"INSERT {BEAR_ID} (Bear)", text)
        self.assertIn(f"SKIP {GONE_ID}", text)
        self.assertIn("would insert 1, update 0, skip 1", text)


if __name__ == "__main__":
    unittest.main()
