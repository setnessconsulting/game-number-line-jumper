import { defineConfig, devices } from "@playwright/test";

const port = process.env.GAME_NLJ_HOST_PORT ?? "4175";
const externalBaseUrl = process.env.GAME_NLJ_HOST_BASE_URL;
const baseURL = externalBaseUrl ?? `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: /.*numberLineJumperHost\.spec\.ts/,
  outputDir: "test-results/host",
  timeout: 90_000,
  expect: { timeout: 5_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"], ["html", { outputFolder: "playwright-report-host", open: "never" }]],
  use: {
    baseURL,
    trace: "retain-on-failure",
  },
  webServer: externalBaseUrl
    ? undefined
    : {
        command: `npm run preview:host-test -- --host 127.0.0.1 --port ${port}`,
        url: `${baseURL}/`,
        reuseExistingServer: false,
        timeout: 120_000,
      },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } } },
  ],
});
