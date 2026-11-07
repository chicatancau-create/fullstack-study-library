import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from src.db import add_record, add_user, connect, query_plan, summary

conn = connect()

alice = add_user(conn, "alice")
bob = add_user(conn, "bob")
add_record(conn, alice, "读 HTTP 缓存", 25, "done")
add_record(conn, alice, "键盘主路径", 30, "draft")
add_record(conn, bob, "SQL 索引", 20, "done")
conn.commit()

print("summary:")
for row in summary(conn):
    print(f"  {row['name']}: {row['record_count']} 条, {row['total_minutes']} 分钟")

print(f"plan: {query_plan(conn)}")

before = conn.execute("SELECT COUNT(*) FROM records").fetchone()[0]
conn.execute("BEGIN")
add_record(conn, bob, "will rollback", 1)
conn.rollback()
after = conn.execute("SELECT COUNT(*) FROM records").fetchone()[0]
print(f"rollback: before={before} after={after}")
assert before == after

try:
    add_record(conn, 999, "orphan", 1)
except Exception as error:
    print(f"fk violation: {type(error).__name__}")
else:
    raise SystemExit("FK FAIL: 未拒绝孤儿记录")

print("DEMO PASS")
conn.close()