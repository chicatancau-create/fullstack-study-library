import { defineConfig } from '@playwright/test';

const db = {
  host: '127.0.0.1', port: 5432, user: 'study', password: 'study-pass', database: process.env.PGDATABASE || 'study_lab',
};

export default defineConfig({
  testDir: './e2e',
  timeout: 45_000,
  workers: 1,
  reporter: [['list']],
  use: { baseURL: 'http://localhost:4184', trace: 'retain-on-failure', channel: process.env.CI ? undefined : 'msedge' },
  globalSetup: './e2e/global-setup.ts',
  webServer: [
    {
      command: 'node src/server.js',
      url: 'http://127.0.0.1:8796/health',
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
      env: { PGHOST: db.host, PGPORT: String(db.port), PGUSER: db.user, PGPASSWORD: db.password, PGDATABASE: db.database, P03_API_KEY: 'test-key', P03_PROVIDER_SECRET: 'test-provider-secret', PORT: '8796' },
    },
    { command: 'npm run preview --prefix web', url: 'http://localhost:4184', reuseExistingServer: !process.env.CI, timeout: 60_000 },
  ],
  env: { PGDATABASE: db.database },
});
