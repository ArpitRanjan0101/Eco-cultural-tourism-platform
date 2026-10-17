import { defineConfig, devices } from '@playwright/test';

const baseURL = process.env.E2E_BASE_URL ?? 'http://web:3000';

// Runs in the `e2e` container against the production build (`web-e2e`, compose.dev.yml). Global setup warms the
// routes; timeouts also allow pointing E2E_BASE_URL at the slower dev server.
export default defineConfig({
  testDir: './src/tests/e2e',
  globalSetup: './src/tests/e2e/global-setup.js',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  // Bounded parallelism: the Docker Desktop VM also runs the backend stack.
  workers: 2,
  forbidOnly: true,
  retries: 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL,
    navigationTimeout: 45_000,
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
