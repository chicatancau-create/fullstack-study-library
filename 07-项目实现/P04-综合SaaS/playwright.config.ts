import { defineConfig } from '@playwright/test';

const db = {
  host: '127.0.0.1', port: 5432, user: 'study', password: 'study-pass', database: process.env.PGDATABASE || 'study_lab',
};

export default defineConfig({
  testDir: './e2e',
  timeout: 45_000,
  workers: 1,
  reporter: [['list']],
  use: { baseURL: 'http://localhost:4185', trace: 'retain-on-failure', channel: process.env.CI ? undefined : 'msedge' },
  globalSetup: './e2e/global-setup.ts',
  webServer: [
    {
      command: 'node src/server.js',
      url: 'http://127.0.0.1:8797/health',
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
      env: { PGHOST: db.host, PGPORT: String(db.port), PGUSER: db.user, PGPASSWORD: db.password, PGDATABASE: db.database, PORT: '8797', REDIS_URL: '' },
    },
    { command: 'npm run preview --prefix web', url: 'http://localhost:4185', reuseExistingServer: !process.env.CI, timeout: 60_000 },
  ],
  env: { PGDATABASE: db.database },
});
