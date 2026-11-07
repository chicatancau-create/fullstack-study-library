"""U06 SQL 示例：约束、事务、聚合、索引与恢复边界（SQLite）。"""

import sqlite3

SCHEMA = """
CREATE TABLE users (
    id   INTEGER PRIMARY KEY,
    name TEXT NOT NULL UNIQUE
);

CREATE TABLE records (
    id       INTEGER PRIMARY KEY,
    user_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title    TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 60),
    minutes  INTEGER NOT NULL CHECK (minutes >= 0),
    status   TEXT NOT NULL CHECK (status IN ('draft', 'done')),
    UNIQUE (user_id, title)
);

CREATE INDEX idx_records_user_status ON records (user_id, status);
"""


def connect() -> sqlite3.Connection:
    conn = sqlite3.connect(":memory:")
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.executescript(SCHEMA)
    return conn


def add_user(conn: sqlite3.Connection, name: str) -> int:
    cur = conn.execute("INSERT INTO users (name) VALUES (?)", (name,))
    return int(cur.lastrowid)


def add_record(
    conn: sqlite3.Connection,
    user_id: int,
    title: str,
    minutes: int,
    status: str = "draft",
) -> int:
    cur = conn.execute(
        "INSERT INTO records (user_id, title, minutes, status) VALUES (?, ?, ?, ?)",
        (user_id, title, minutes, status),
    )
    return int(cur.lastrowid)


def summary(conn: sqlite3.Connection) -> list[sqlite3.Row]:
    return conn.execute(
        """
        SELECT u.name,
               COUNT(r.id) AS record_count,
               COALESCE(SUM(r.minutes), 0) AS total_minutes
        FROM users AS u
        LEFT JOIN records AS r ON r.user_id = u.id
        GROUP BY u.id, u.name
        ORDER BY u.name
        """
    ).fetchall()


def query_plan(conn: sqlite3.Connection) -> str:
    rows = conn.execute(
        "EXPLAIN QUERY PLAN SELECT * FROM records WHERE user_id = ? AND status = ?",
        (1, "done"),
    ).fetchall()
    return " | ".join(str(row["detail"]) for row in rows)