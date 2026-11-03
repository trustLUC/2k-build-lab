import { defineConfig } from '@playwright/test';
const base = process.env.BL_BASE_URL || 'http://127.0.0.1:4173';
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 30000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: { baseURL: base, channel: 'chrome', acceptDownloads: true },
  webServer: process.env.BL_BASE_URL ? undefined : { command: 'python3 -m http.server 4173 --bind 127.0.0.1', url: base, reuseExistingServer: true, stdout: 'ignore', stderr: 'ignore' },
  projects: [
    { name: 'desktop-1280', use: { viewport: { width: 1280, height: 800 } } },
    { name: 'phone-390', use: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true } },
  ],
});
