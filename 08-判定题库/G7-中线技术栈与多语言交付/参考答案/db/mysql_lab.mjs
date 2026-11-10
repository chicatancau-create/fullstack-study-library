// G7 参考答案：隔离级别切换 + 条件扣减防超卖 + FOR UPDATE 行锁 + 交叉加锁触发死锁。
import mysql from 'mysql2/promise';

const DSN = {
  host: process.env.MYSQL_HOST || '127.0.0.1',
  port: Number(process.env.MYSQL_PORT || 3307),
  user: process.env.MYSQL_USER || 'study',
  password: process.env.MYSQL_PASSWORD || 'study-pass',
  database: 'g7_lab',
};

/** 用 SET TRANSACTION ISOLATION LEVEL 在事务内切级别（MySQL 要求它是事务的第一条语句）。 */
export async function withIsolation(level, fn) {
  const conn = await mysql.createConnection(DSN);
  try {
    await conn.query(`SET TRANSACTION ISOLATION LEVEL ${level}`);
    await conn.beginTransaction();
    return await fn(conn);
  } finally {
    await conn.rollback().catch(() => {});
    await conn.end();
  }
}

/** mode=optimistic 时用 version 做 CAS；默认用条件扣减。 */
export async function tryReserve(sku, qty, { mode = 'conditional' } = {}) {
  const conn = await mysql.createConnection(DSN);
  try {
    if (mode === 'optimistic') {
      const [rows] = await conn.query('SELECT available, version FROM stock WHERE sku = ?', [sku]);
      const row = rows[0];
      if (!row || row.available < qty) return { ok: false, reason: 'out_of_stock' };
      const [res] = await conn.query(
        'UPDATE stock SET available = available - ?, version = version + 1 WHERE sku = ? AND version = ?',
        [qty, sku, row.version],
      );
      if (res.affectedRows === 0) return { ok: false, reason: 'conflict' };
      return { ok: true, left: row.available - qty };
    }
    // 条件扣减：一条语句完成判断与扣减
    const [res] = await conn.query(
      'UPDATE stock SET available = available - ? WHERE sku = ? AND available >= ?',
      [qty, sku, qty],
    );
    if (res.affectedRows === 0) return { ok: false, reason: 'out_of_stock' };
    const [rows] = await conn.query('SELECT available FROM stock WHERE sku = ?', [sku]);
    return { ok: true, left: rows[0].available };
  } finally {
    await conn.end();
  }
}

/** 行锁：SELECT ... FOR UPDATE + 事务内 UPDATE，两个事务抢同一行必须串行。 */
export async function acquireSeat(seatId) {
  const conn = await mysql.createConnection(DSN);
  try {
    await conn.beginTransaction();
    const [rows] = await conn.query('SELECT taken FROM seat WHERE id = ? FOR UPDATE', [seatId]);
    if (!rows[0] || rows[0].taken) {
      await conn.rollback();
      return { ok: false, reason: rows[0] ? 'taken' : 'missing' };
    }
    await conn.query('UPDATE seat SET taken = 1 WHERE id = ?', [seatId]);
    await conn.commit();
    return { ok: true };
  } catch (error) {
    await conn.rollback().catch(() => {});
    return { ok: false, reason: error.code ?? 'error' };
  } finally {
    await conn.end();
  }
}

/** 交叉加锁：A 锁 s1→s2，B 锁 s2→s1，MySQL 必然检测到死锁（1213）。 */
export async function deadlockDemo() {
  const a = await mysql.createConnection(DSN);
  const b = await mysql.createConnection(DSN);
  const lockPair = async (conn, first, second) => {
    await conn.beginTransaction();
    await conn.query('SELECT * FROM seat WHERE id = ? FOR UPDATE', [first]);
    await new Promise((r) => setTimeout(r, 50));
    await conn.query('SELECT * FROM seat WHERE id = ? FOR UPDATE', [second]);
    await conn.commit();
  };
  try {
    const results = await Promise.allSettled([lockPair(a, 's2', 's3'), lockPair(b, 's3', 's2')]);
    return results
      .map((r) => (r.status === 'rejected' ? String(r.reason?.code ?? r.reason) : 'ok'))
      .join(',');
  } finally {
    await a.rollback().catch(() => {});
    await b.rollback().catch(() => {});
    await a.end().catch(() => {});
    await b.end().catch(() => {});
  }
}

export async function close() {}
