import { defineConfig } from '@playwright/test';

const databaseUrl = process.env.E2E_DATABASE_URL
  || 'postgresql://study:study-pass@127.0.0.1:5432/study_lab_p02_e2e?schema=public';

export default defineConfig({
  testDir: './e2e',
  timeout: 45_000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:4183',
    trace: 'retain-on-failure',
    channel: process.env.CI ? undefined : 'msedge',
  },
  webServer: [
    {
      command: 'node src/server.js',
      url: 'http://127.0.0.1:3102/health',
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
      env: { DATABASE_URL: databaseUrl, JWT_SECRET: 'p02-e2e-secret', PORT: '3102' },
    },
    {
      command: 'npm run preview --prefix web',
      url: 'http://localhost:4183',
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
  ],
});
