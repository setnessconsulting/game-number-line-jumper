import { defineConfig, devices } from "@playwright/test";

const port = process.env.GAME_NLJ_E2E_PORT ?? "4173";
const externalBaseUrl = process.env.GAME_NLJ_E2E_BASE_URL;
const baseURL = externalBaseUrl ?? `http://127.0.0.1:${port}`;
const performanceTest = /numberLineJumperPerformance\.spec\.ts/;
const hostHarnessTest = "**/numberLineJumperHost.spec.ts";

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: /.*\.spec\.ts/,
  testIgnore: ["**/numberLineJumperHost.spec.ts"],
  outputDir: "test-results/e2e",
  timeout: 90_000,
  expect: { timeout: 5_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"], ["html", { outputFolder: "playwright-report", open: "never" }]],
  use: {
    baseURL,
    trace: "retain-on-failure",
  },
  webServer: externalBaseUrl
    ? undefined
    : {
        command: `npm run preview -- --host 127.0.0.1 --port ${port}`,
        url: `${baseURL}/`,
        reuseExistingServer: false,
        timeout: 120_000,
  },
  projects: [
    {
      name: "chromium-performance",
      testMatch: performanceTest,
      use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } },
    },
    {
      name: "chromium",
      testIgnore: [performanceTest, hostHarnessTest],
      use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } },
    },
    {
      name: "firefox",
      testIgnore: [performanceTest, hostHarnessTest],
      use: { ...devices["Desktop Firefox"], viewport: { width: 1280, height: 800 } },
    },
    {
      name: "mobile-webkit",
      testIgnore: [performanceTest, hostHarnessTest],
      use: { ...devices["iPhone 13"], viewport: { width: 390, height: 844 }, browserName: "webkit" },
    },
  ],
});
