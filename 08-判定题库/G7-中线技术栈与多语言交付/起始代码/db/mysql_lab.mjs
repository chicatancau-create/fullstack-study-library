// G7 起始代码：MySQL 实验（4 处真实缺陷）
//   缺陷 1：withIsolation 不切级别，只是 BEGIN/COMMIT（隔离实验无效）
//   缺陷 2：tryReserve 先 SELECT 再 UPDATE，没有条件扣减（并发超卖）
//   缺陷 3：acquireSeat 不加 FOR UPDATE，两个事务能同时抢到同一座位
//   缺陷 4：deadlockDemo 顺序加锁（不构成死锁），永远返回成功
import mysql from 'mysql2/promise';

const DSN = {
  host: process.env.MYSQL_HOST || '127.0.0.1',
  port: Number(process.env.MYSQL_PORT || 3307),
  user: process.env.MYSQL_USER || 'study',
  password: process.env.MYSQL_PASSWORD || 'study-pass',
  database: 'g7_lab',
};

export async function withIsolation(level, fn) {
  const conn = await mysql.createConnection(DSN);
  try {
    await conn.beginTransaction();
    return await fn(conn);
  } finally {
    await conn.rollback().catch(() => {});
    await conn.end();
  }
}

export async function tryReserve(sku, qty) {
  const conn = await mysql.createConnection(DSN);
  try {
    const [rows] = await conn.query('SELECT available FROM stock WHERE sku = ?', [sku]);
    const available = rows[0]?.available ?? 0;
    if (available < qty) return { ok: false, reason: 'out_of_stock' };
    await conn.query('UPDATE stock SET available = ? WHERE sku = ?', [available - qty, sku]);
    return { ok: true, left: available - qty };
  } finally {
    await conn.end();
  }
}

export async function acquireSeat(seatId) {
  const conn = await mysql.createConnection(DSN);
  try {
    const [rows] = await conn.query('SELECT taken FROM seat WHERE id = ?', [seatId]);
    if (rows[0]?.taken) return { ok: false, reason: 'taken' };
    await conn.query('UPDATE seat SET taken = 1 WHERE id = ?', [seatId]);
    return { ok: true };
  } finally {
    await conn.end();
  }
}

export async function deadlockDemo() {
  return 'no-deadlock';
}

export async function close() {}
