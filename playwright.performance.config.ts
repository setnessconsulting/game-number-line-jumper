import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/performance",
  timeout: 90_000,
  expect: { timeout: 10_000 },
  retries: 0,
  workers: 1,
  reporter: [["html", { outputFolder: "playwright-report-performance", open: "never" }], ["list"]],
  outputDir: "test-results-performance",
  use: {
    baseURL: "http://127.0.0.1:4176",
    trace: "on",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  webServer: {
    command: "npm run preview -- --host 127.0.0.1 --port 4176",
    url: "http://127.0.0.1:4176",
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
  projects: [
    {
      name: "chromium-performance",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "firefox-smoke",
      use: { ...devices["Desktop Firefox"] },
    },
  ],
});
