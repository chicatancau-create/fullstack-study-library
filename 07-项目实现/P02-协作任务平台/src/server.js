import { PrismaClient } from '@prisma/client';
import { buildApp } from './app.js';

const prisma = new PrismaClient();
const app = await buildApp({ prisma });
const port = Number(process.env.PORT || 3102);
const host = process.env.HOST || '0.0.0.0';

const shutdown = async () => {
  await app.close();
  await prisma.$disconnect();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

app.listen({ port, host }).then(() => {
  console.log(`P02 listening on http://${host}:${port}`);
});
