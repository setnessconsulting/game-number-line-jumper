import { defineConfig, devices } from "@playwright/test";

const port = process.env.GAME_NLJ_A11Y_PORT ?? "4174";
const externalBaseUrl = process.env.GAME_NLJ_A11Y_BASE_URL;
const baseURL = externalBaseUrl ?? `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: "./tests/accessibility",
  testMatch: /.*\.a11y\.spec\.ts/,
  timeout: 90_000,
  expect: { timeout: 5_000 },
  fullyParallel: false,
  workers: 1,
  reporter: "list",
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
      name: "desktop-chromium",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 900 } },
    },
    {
      name: "mobile-webkit",
      use: { ...devices["iPhone 13"], viewport: { width: 390, height: 844 }, browserName: "webkit" },
    },
  ],
});
