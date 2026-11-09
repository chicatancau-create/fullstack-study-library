import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  workers: 1,
  reporter: [['list']],
  use: { baseURL: 'http://localhost:5193', trace: 'retain-on-failure', channel: process.env.CI ? undefined : 'msedge' },
  webServer: {
    command: 'npm run dev -- --port 5193 --strictPort',
    url: 'http://localhost:5193',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
