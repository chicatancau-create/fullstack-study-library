import { buildApp } from './app.js';

const app = buildApp({ logger: true });
const port = Number(process.env.PORT || 8790);

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, async () => {
    app.log.info({ signal }, 'closing');
    await app.close();
    process.exit(0);
  });
}

try {
  await app.listen({ port, host: '127.0.0.1' });
} catch (error) {
  app.log.error(error);
  process.exit(1);
}