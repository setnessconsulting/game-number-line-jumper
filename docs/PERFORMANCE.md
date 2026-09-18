# Number Line Jumper performance qualification

GAME-219 measures responsiveness on the production build without adding production telemetry.

## Metrics

- **Pointermove-to-next-frame** is an input-to-frame/presentation proxy measured by Playwright. It is not browser-native Event Timing duration; continuous pointermove events are excluded from Event Timing.
- Typical Chromium target: p95 <= 16 ms over roughly 200 moves.
- Chromium under 6x CPU throttling target: p95 <= 50 ms.
- **Reveal transition** excludes the intentional 900/1100/1400/1700 ms coaching dwell. The metric begins when that scheduled dwell callback fires and ends at the first frame where the next scored placement accepts input. Target: p95 <= 200 ms over a ten-trial round.
- A PerformanceObserver records long tasks during drag and zoom. No observed long task may exceed 50 ms.
- Lighthouse CI records mobile **lab** LCP (<=2.5 s) and CLS (<=0.1). These are not field percentiles.
- Field INP is only accepted from eligible CrUX real-user data for the promoted public route. Until GAME-293 promotes such a route with sufficient CrUX coverage, INP is **UNKNOWN/PENDING**.

## Bundle baseline

The pinned comparison is `9b5f418f10503e4fb2d592756f9fb19c22c12dc5`, whose CI production artifact measured:

- learner JavaScript raw: 245,811 bytes
- learner JavaScript gzip level 9: 74,652 bytes

`npm run perf:bundle` reports absolute and percentage gzip delta against that pinned baseline and fails on a material unexplained increase. The existing learner-bundle gate separately rejects Phaser, Pixi, Unity/WebGL runtimes, Sentry/browser observability SDKs, and sibling-only runtimes.

## Cross-browser and evidence

The bounded CI qualification runs the normal Chromium/mobile-WebKit suite plus a GAME-219 performance lane containing Chromium performance measurements and Firefox smoke qualification. Artifacts are tied to the exact workflow SHA.

A real iOS or Android interaction pass remains owner-observed evidence. Automation must not claim that gate passed.

No runtime performance beacon, remote SDK, or learner-session telemetry is introduced.
