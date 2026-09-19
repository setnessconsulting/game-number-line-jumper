// Lighthouse CI loads this config as CommonJS.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { chromium } = require("@playwright/test");

module.exports = {
  ci: {
    collect: {
      staticDistDir: "./dist",
      url: ["http://localhost/"],
      numberOfRuns: 3,
      chromePath: process.env.CHROME_PATH || chromium.executablePath(),
      settings: {
        formFactor: "mobile",
        onlyCategories: ["performance"],
        throttlingMethod: "simulate",
        // The Playwright Chrome binary runs without a usable setuid sandbox on
        // the hosted CI runner; this job is already isolated by GitHub Actions.
        chromeFlags: "--no-sandbox --disable-setuid-sandbox",
      },
    },
    assert: {
      assertions: {
        "largest-contentful-paint": ["error", { maxNumericValue: 2500, aggregationMethod: "median" }],
        "cumulative-layout-shift": ["error", { maxNumericValue: 0.1, aggregationMethod: "median" }],
      },
    },
    upload: {
      target: "filesystem",
      outputDir: ".lighthouseci",
    },
  },
};
