# GAME-219 performance qualification

This note records the performance budgets and the evidence available for the standalone Number Line Jumper build. Lab checks are not field Core Web Vitals, and browser emulation is not a substitute for owner-observed physical-device testing.

## Budgets and measurement boundaries

| Area | Budget | Evidence |
| --- | --- | --- |
| Local production-build Lighthouse, mobile simulated | Median LCP ≤ 2,500 ms; median CLS ≤ 0.1 across three runs | Lighthouse CI reads `dist/` and writes a local `.lighthouseci/` report. Hosted Linux CI attaches the report to the tested commit. |
| Drag responsiveness, typical Chromium | p95 input-to-next-frame proxy ≤ 16 ms | 200 dispatched pointer moves; the harness records the event timestamp, marker inline-transform update, and following `requestAnimationFrame` callback. |
| Drag responsiveness, 6× CPU-throttled Chromium | p95 input-to-next-frame proxy ≤ 50 ms | Same 200-event trace with CDP CPU throttling. |
| Drag and Explore zoom long tasks | No observed task longer than 50 ms | `PerformanceObserver` long-task entries during the bounded interaction window. |
| Reveal transition | p95 ≤ 200 ms after the intentional game dwell | Nine measured transitions over ten trials; the final trial completes the round. Intentional feedback dwell is excluded. |
| Learner JavaScript gzip size | Record the absolute and percentage change against the pinned baseline | Vite production-build output; only the learner production bundle is counted, not development tooling. |

The pointer metric is a custom input-to-frame proxy, not browser paint presentation timing. It is intentionally not labeled Event Timing INP: the [W3C Event Timing specification](https://w3c.github.io/event-timing/) excludes continuous events such as `pointermove` from its event entries. The tests preserve the dispatched event timestamp and report both the style-update and next-frame samples so the proxy is auditable.

## Evidence produced by the gates

- `npm run check:bundle-budget` compares the learner JavaScript assets against the pinned `performance/baseline.json` SHA and writes `performance-results/bundle-budget.json`, including raw/gzip bytes and absolute/percentage deltas.
- `npm run test:e2e:run` runs the functional matrix in desktop Chromium, desktop Firefox, and mobile WebKit. `tests/e2e/numberLineJumperPerformance.spec.ts` emits pointer-frame, long-task, and reveal-transition JSON attachments tied to the Playwright test result.
- `npm run perf:lighthouse` runs three mobile Lighthouse CI lab measurements against the static production build and writes `.lighthouseci/`. Hosted CI supplies Chrome's `--no-sandbox` flags because its isolated runner does not expose a usable setuid sandbox. On this Windows workstation the current local launch fails with Chrome Launcher `spawn UNKNOWN` before an audit; native Windows can also hit temporary-profile cleanup `EPERM`. The hosted Linux browser job is authoritative for LCP and CLS and for Firefox execution.
- The CI evidence manifest records the exact source/workflow SHA, lockfile digest, browser versions, production build digest, bundle-budget report, Lighthouse report digest, and gate results. It explicitly leaves field INP as `UNKNOWN/PENDING` until an eligible public CrUX sample exists; no runtime telemetry is allowed.

The local Lighthouse budget is configured in `lighthouserc.cjs`. Lighthouse CI uses a static production build and filesystem-only report output, following the [Lighthouse CI configuration](https://github.com/GoogleChrome/lighthouse-ci/blob/main/docs/configuration.md); it does not upload to a Lighthouse server or collect learner telemetry. The hosted Linux workflow is the authoritative CI result when a Windows workstation cannot launch the pinned Firefox or Chrome binary.

Field INP remains **unknown / pending**. There is no promoted public playable route with an eligible CrUX sample, and the game deliberately has no field telemetry. CrUX eligibility and the field-data boundary are described in the [CrUX API documentation](https://developer.chrome.com/docs/crux/guides/crux-api). Do not substitute lab results for field INP.

## Acceptance boundary

Playwright WebKit and mobile emulation do not establish physical-device behavior. The owner-observed Android Chrome and Windows Chrome preview pass is recorded on GAME-219 separately from this repository's CI evidence. No deployment or publication is part of GAME-219.
