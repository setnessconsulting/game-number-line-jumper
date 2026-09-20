# GAME-291 extraction and parity report

## Provenance

- Source repository: `https://github.com/setnessconsulting/levelbest`
- Source ref: `main`
- Source commit: `38a9dfa78e8c1cef2238ba27fd058fc3d9f8a683`
- Retrieved: 2026-09-17
- Source UI: `legacy/next-reference/src/app/games/NumberLineJumper.tsx`
- Source domain files: `src/lib/numberLineJumper/adaptive.ts`, `aggregates.ts`, `engine.ts`, `sound.ts`, `types.ts`, `visitBests.ts`
- Source shared primitive: `src/lib/games/shared/rng.ts`
- Source tests: `legacy/next-reference/tests/numberLineJumper*.test.ts` and `legacy/next-reference/tests/e2e/numberLineJumper.spec.ts`
- Target branch: `codex/game-291-bootstrap`
- Target extraction commit: `290f39bb7691c7425de6dad30b1afe150fce1319`

## Component disposition

| Component or behavior | Disposition | Notes |
| --- | --- | --- |
| `src/lib/numberLineJumper/types.ts` | copied unchanged | Pure domain types. |
| `src/lib/numberLineJumper/engine.ts` | mechanical standalone adaptation | Source logic is unchanged; the required shared PRNG remains local under `src/lib/games/shared/rng.ts`. |
| `src/lib/numberLineJumper/adaptive.ts` | copied unchanged | Seeded, bounded, current-run-only adaptation. |
| `src/lib/numberLineJumper/aggregates.ts` | copied unchanged | Session aggregate contract; no persistence or transport. |
| `src/lib/numberLineJumper/visitBests.ts` | copied unchanged | React page-session bests support. |
| `src/lib/numberLineJumper/sessionStore.ts` | standalone implementation | GAME-227's guarded, versioned browser-tab continuity boundary; no LevelBest storage or transport is imported. |
| `src/lib/numberLineJumper/sound.ts` | mechanical standalone adaptation | Source logic is unchanged; the alias resolves inside this repository. Web Audio remains opt-in. |
| `src/app/games/NumberLineJumper.tsx` | mechanical standalone adaptation | Shipping React surface retained at the same app path; host callback remains the existing `onExit` seam. |
| Number Line Jumper unit tests | copied with path-preserving relocation | Tests remain executable parity evidence under `tests/`. |
| Browser smoke tests | adapted from executable source flow | Hub navigation was removed because it is LevelBest host code; waits use observable UI state rather than fixed sleeps. |
| `src/lib/games/shared/rng.ts` | minimum shared primitive copied | Required because the shipping engine re-exports the established `mulberry32` implementation. |
| LevelBest hub, pilot, routing, auth, APIs, storage, analytics, and unrelated games | intentionally excluded | Host/application infrastructure is outside GAME-291. |
| Typed host contract | deferred at GAME-291 extraction; defined by GAME-292 | The standalone v1 seam is documented in `docs/HOST_CONTRACT.md`; no direct LevelBest integration is introduced. |
| games-site static release/promotion/rollback | deferred to GAME-293 | No public hosting mutation is introduced. |
| Automated accessibility/CI expansion, performance, design, benchmark, and integration stories | deferred | GAME-217, GAME-218, GAME-219, GAME-220, GAME-221, GAME-222, GAME-223, GAME-224, GAME-225 through GAME-235 remain downstream. |
| Scored zoom | intentionally excluded | GAME-229 remains Won't Do; only the existing unscored Explore zoom is present. |

## Known variance

There is no known behavior-affecting variance from source commit `38a9dfa`. The standalone changes are limited to the Vite entry point, local file placement, alias resolution, extraction of only the game CSS rules, removal of LevelBest hub navigation from the browser harness, and replacement of timing sleeps with UI-observable waits. The game callback still exits to a fresh standalone setup view.

At the GAME-291 extraction commit, the standalone shell did not yet implement the host callback contract. GAME-292 subsequently added the host-agnostic v1 boundary and local harness; LevelBest application wiring remains outside this repository and is not a gameplay variance.

## Validation record

Commands required by GAME-291:

```text
npm ci
npm run typecheck
npm run lint
npm test
npm run build
npm run test:e2e
```

The baseline CI workflow is credential-free and runs `npm ci`, typecheck, lint, unit tests, and build.

### Local verification before clean-room validation

- `npm ci --ignore-scripts`: PASS; lockfile install completed with 164 packages and 0 vulnerabilities.
- `npm run typecheck`: PASS.
- `npm run lint`: PASS.
- `npm test`: PASS; 8 test files and 147 tests.
- `npm run build`: PASS; Vite transformed 23 modules and produced `dist/`.
- `GAME_NLJ_E2E_PORT=4190 npm run test:e2e`: PASS; 13 browser tests passed and 1 desktop mobile-only test was intentionally skipped across Chromium desktop and mobile projects.
- Built preview visual/runtime check on port 4189: PASS; meaningful page content, no Vite error overlay, no browser console errors, Guided warm-up/reveal, and playable slider observed.
- The prescribed `agent-browser` executable was unavailable on this workstation; Playwright plus the available browser surface provided the equivalent built-runtime evidence.

### Clean-clone validation

Remote branch `codex/game-291-bootstrap` was cloned at `8b72de3ec0feb3d516ebcd890059fdcb1eb3b026` into a clean directory with no LevelBest checkout in the validation working directory.

- `npm ci`: PASS; lockfile install completed with 164 packages and 0 vulnerabilities.
- `npm run typecheck`: PASS.
- `npm run lint`: PASS.
- `npm test`: PASS; 8 test files and 147 tests.
- `npm run build`: PASS; Vite transformed 23 modules and produced `dist/`.
- `GAME_NLJ_E2E_PORT=4191 npm run test:e2e`: PASS; 13 browser tests passed and 1 desktop mobile-only test was intentionally skipped across Chromium desktop and mobile projects.
- Clean-clone git status after verification: PASS; no tracked changes.

## GAME-218 CI quality gates

The standalone repository now owns the PR/main quality gate; browser checks do not depend on the legacy application repository.

- `npm run test:coverage` runs the Vitest files with V8 coverage. The denominator is explicit: the game engine, aggregates, adaptive logic, visit bests, guarded session store, sound, Explore prompt, host contract, placement adapter, and seeded random helper. Each runtime module is held to at least 90% lines, branches, and functions. The type-only `types.ts` declarations are intentionally excluded because they emit no runtime behavior; no executable critical module is excluded.
- The production browser config uses desktop Chromium and mobile WebKit against the normal production build on port 4173. Accessibility checks use that same build on port 4174. GAME-292 host-lifecycle journeys run against a separate test-only host-harness build on port 4175, not in the learner artifact.
- A shared Playwright fixture fails tests on browser console errors and uncaught page errors. Playwright retry count is zero in every config; traces and reports preserve original failures.
- CI always performs typecheck, lint, unit/coverage, production and host-test builds, the source/IP scan, and learner-bundle assertion. It classifies README/docs-only diffs to skip only the expensive browser matrix; a manual `workflow_dispatch` runs the complete matrix regardless of changed paths.
- The verification artifact reuses the learner production build across the browser and accessibility suites and includes `coverage-summary.json` plus `lcov.info`. Browser reports/traces are published separately.
- `game-ci-evidence-<workflow-sha>` contains the PR source SHA (or pushed commit SHA), workflow SHA, check outcomes, package-lock digest, Node/npm/Playwright/Vitest and pinned Chromium/WebKit versions, coverage totals, and SHA-256 digests for production assets. Artifacts are retained for 90 days; GAME-224 must preserve any accepted release evidence in its durable manifest.
- The IP separation scan checks shipped `src/`, optional `public/`, `index.html`, and production `dist/`; README/docs and tests remain separate. GAME-222's benchmark remediation ledger is still deferred and is not invented or included in this change. The bundle assertion allows only React/React DOM as direct runtime dependencies and rejects known prohibited runtime packages, asset paths, and bundle markers.

Local full-gate parity is `npm run test:ci`. Individual browser commands are also documented in `README.md`. Hosted CI is authoritative for PR/main evidence; docs-only browser skips are explicitly marked `skipped-docs-only` in the evidence artifact and are not full release qualification.
