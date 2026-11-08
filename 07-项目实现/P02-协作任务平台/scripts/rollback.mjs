import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const sql = readFileSync('prisma/migrations/20261108000000_init/down.sql', 'utf8');
const statements = sql
  .split(';')
  .map((s) => s.trim())
  .filter(Boolean);

for (const statement of statements) {
  await prisma.$executeRawUnsafe(statement);
}
console.log(`rollback: ${statements.length} statements applied, tables dropped`);

const restore = spawnSync('npx', ['prisma', 'migrate', 'deploy'], { encoding: 'utf8', shell: process.platform === 'win32' });
process.stdout.write(restore.stdout || '');
process.stderr.write(restore.stderr || '');
console.log(`rollback: re-migrate exit=${restore.status}`);
await prisma.$disconnect();
process.exit(restore.status === 0 ? 0 : 1);
