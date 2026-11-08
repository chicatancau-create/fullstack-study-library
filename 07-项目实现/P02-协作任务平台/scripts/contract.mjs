import { PrismaClient } from '@prisma/client';
import { buildApp } from '../src/app.js';

const prisma = new PrismaClient();
const app = await buildApp({ prisma, jwtSecret: process.env.JWT_SECRET || 'p02-contract-secret' });
await app.ready();
const res = await app.inject({ method: 'GET', url: '/openapi.json' });
const doc = res.json();
const required = [
  '/auth/register',
  '/auth/login',
  '/auth/refresh',
  '/workspaces',
  '/workspaces/{id}/tasks',
  '/tasks/{id}',
  '/tasks/{id}/comments',
];
let failed = 0;
for (const path of required) {
  const ok = Boolean(doc.paths?.[path]);
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${path}`);
  if (!ok) failed++;
}
console.log(`openapi: ${required.length - failed}/${required.length} paths present, version=${doc.openapi}`);
await app.close();
await prisma.$disconnect();
process.exit(failed === 0 ? 0 : 1);
