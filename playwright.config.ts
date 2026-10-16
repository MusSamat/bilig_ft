/**
 * E2E (TZ §3 scenarios, §10 axe): runs against the Vite dev server with the
 * MSW mock API (`VITE_MOCK=1`), so no backend is needed.
 */
import { defineConfig, devices } from '@playwright/test';

const PORT = 5174;

export default defineConfig({
  testDir: './e2e',
  timeout: 180_000,
  expect: { timeout: 30_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // Software WebGL (SwiftShader) by default, as in CI: deterministic visual baselines.
        // E2E_GPU=1 uses the machine's GPU instead (faster local runs; not for --update-snapshots).
        launchOptions: {
          args: process.env.E2E_GPU
            ? ['--use-angle=gl-egl', '--enable-gpu', '--ignore-gpu-blocklist']
            : ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--ignore-gpu-blocklist'],
        },
      },
    },
  ],
  webServer: {
    command: `npx vite --port ${PORT} --strictPort`,
    env: { VITE_MOCK: '1' },
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
