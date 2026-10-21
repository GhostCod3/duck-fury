import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/browser',
  timeout: 45000,
  workers: 1,
  retries: 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: { baseURL: 'http://127.0.0.1:5173/duck-fury/', viewport: { width: 1440, height: 1050 }, trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  webServer: [
    { command: 'npm run dev -- --host 127.0.0.1 --port 5173', url: 'http://127.0.0.1:5173/duck-fury/', reuseExistingServer: !process.env.CI },
    { command: 'npm run preview -- --host 127.0.0.1 --port 4173', url: 'http://127.0.0.1:4173/duck-fury/', reuseExistingServer: !process.env.CI },
    ...(process.env.QA_BASELINE ? [{ command: 'npm --prefix .qa-baseline run dev -- --host 127.0.0.1 --port 5174', url: 'http://127.0.0.1:5174/duck-fury/', reuseExistingServer: !process.env.CI }] : []),
    ...(process.env.QA_REFERENCE ? [{ command: 'python3 -m http.server 8000 --bind 127.0.0.1 --directory tests/fixtures', url: 'http://127.0.0.1:8000/reference/', reuseExistingServer: !process.env.CI }] : []),
  ],
});
