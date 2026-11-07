import sqlite3
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from src.db import add_record, add_user, connect, query_plan, summary


class SqlTest(unittest.TestCase):
    def setUp(self) -> None:
        self.conn = connect()
        self.user_id = add_user(self.conn, "alice")
        self.conn.commit()

    def tearDown(self) -> None:
        self.conn.close()

    def test_foreign_keys_on(self) -> None:
        self.assertEqual(self.conn.execute("PRAGMA foreign_keys").fetchone()[0], 1)

    def test_foreign_key_violation(self) -> None:
        with self.assertRaises(sqlite3.IntegrityError):
            add_record(self.conn, 999, "orphan", 1)

    def test_unique_user(self) -> None:
        with self.assertRaises(sqlite3.IntegrityError):
            add_user(self.conn, "alice")

    def test_check_minutes(self) -> None:
        with self.assertRaises(sqlite3.IntegrityError):
            add_record(self.conn, self.user_id, "bad", -1)

    def test_check_status(self) -> None:
        with self.assertRaises(sqlite3.IntegrityError):
            add_record(self.conn, self.user_id, "bad", 1, "unknown")

    def test_unique_user_title(self) -> None:
        add_record(self.conn, self.user_id, "same", 1)
        with self.assertRaises(sqlite3.IntegrityError):
            add_record(self.conn, self.user_id, "same", 2)

    def test_cascade_delete(self) -> None:
        add_record(self.conn, self.user_id, "r1", 1)
        self.conn.execute("DELETE FROM users WHERE id = ?", (self.user_id,))
        self.conn.commit()
        self.assertEqual(self.conn.execute("SELECT COUNT(*) FROM records").fetchone()[0], 0)

    def test_transaction_rollback(self) -> None:
        before = self.conn.execute("SELECT COUNT(*) FROM records").fetchone()[0]
        self.conn.execute("BEGIN")
        add_record(self.conn, self.user_id, "rolled-back", 5)
        self.conn.rollback()
        after = self.conn.execute("SELECT COUNT(*) FROM records").fetchone()[0]
        self.assertEqual(before, after)

    def test_summary(self) -> None:
        add_record(self.conn, self.user_id, "a", 5, "done")
        add_record(self.conn, self.user_id, "b", 7, "draft")
        rows = summary(self.conn)
        self.assertEqual(rows[0]["name"], "alice")
        self.assertEqual(rows[0]["record_count"], 2)
        self.assertEqual(rows[0]["total_minutes"], 12)

    def test_index_plan(self) -> None:
        plan = query_plan(self.conn)
        self.assertIn("idx_records_user_status", plan)


if __name__ == "__main__":
    unittest.main()