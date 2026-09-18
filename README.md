# Number Line Jumper

This repository is the authoritative implementation, build, test, and release-artifact source for Number Line Jumper under GAME-3. It is a standalone React + TypeScript application and does not require the historical LevelBest repository.

## Active documentation

The canonical product/design/architecture package is under `docs/games/number-line-jumper/`:

- `REQUIREMENTS.md`
- `UX_DESIGN.md`
- `PROTOTYPE_NOTES.md`
- `EPIC_PLAN.md`
- `SPRINT_READINESS.md`
- `BENCHMARK_REVIEW.md`

The existing flat documents are supporting evidence or contract detail rather than competing product requirements sources:

- `docs/PARITY.md` — GAME-291 source provenance and extraction/parity evidence.
- `docs/HOST_CONTRACT.md` — GAME-292 host-contract detail.
- `docs/GAMES_SITE_RELEASE.md` — GAME-293 build/publication mechanics.

Those supporting files do not imply that downstream Figma, benchmark, owner-observed, production-promotion, or final-acceptance gates have passed.

## Source provenance

The game was extracted from the executable shipping implementation, not reconstructed from Jira prose:

- Original repository: [`setnessconsulting/levelbest`](https://github.com/setnessconsulting/levelbest)
- Original ref: `main`
- Exact source commit: `38a9dfa78e8c1cef2238ba27fd058fc3d9f8a683`
- Retrieved: 2026-09-17
- UI source: `legacy/next-reference/src/app/games/NumberLineJumper.tsx`
- Domain/support source: `src/lib/numberLineJumper/{adaptive,aggregates,engine,sound,types,visitBests}.ts`
- Required shared primitive: `src/lib/games/shared/rng.ts`
- Ported executable tests: `legacy/next-reference/tests/numberLineJumper*.test.ts` and `legacy/next-reference/tests/e2e/numberLineJumper.spec.ts`

The extraction and parity decisions are recorded in [`docs/PARITY.md`](docs/PARITY.md).

## Architecture

The mathematical engine in `src/lib/numberLineJumper/` is pure TypeScript. It owns ranges, seeded generation, adaptive target rhythm, scoring, summaries, session aggregates, visit bests, and Explore zoom math. It has no DOM, React state, clock, storage, network, identity, or host-application dependency. Rendered coordinates are projections of normalized mathematical state; they never become the source of truth.

The React shell in `src/app/games/NumberLineJumper.tsx` preserves the shipping Guided, Challenge, and Explore paths, including whole numbers, fractions, decimals, negatives, accessibility semantics, reduced-motion behavior, opt-in Web Audio, and page-session-only visit bests. Its optional v1 host prop is documented in [`docs/HOST_CONTRACT.md`](docs/HOST_CONTRACT.md); host-specific application wiring remains outside this repository. Explore zoom remains unscored; GAME-229 scored zoom is not implemented.

GAME-292 establishes the standalone host boundary and local integration harness. GAME-293 adds the static-web build/release contract used by games-site; public catalog selection, promotion, rollback, and hosted acceptance remain owned by `setnessconsulting/games-site`. LevelBest-specific lesson wiring and downstream quality stories remain separately scoped.

## Development

Required runtime: Node.js `24.x` (see `.nvmrc`).

```text
npm ci
npm run dev
npm run test:ci
```

`npm run test:ci` is the complete local pre-push gate: typecheck, lint, unit tests with coverage thresholds, production build, source/IP scan, bundle assertion, production browser journeys, accessibility qualification, and host-lifecycle browser tests. For faster iteration, run the relevant command directly:

```text
npm run typecheck
npm run lint
npm test
npm run test:coverage
npm run build
npm run test:e2e
npm run test:a11y
npm run test:host
```

The coverage gate uses V8 coverage for the engine, adaptive/scoring modules, host contract and adapters, Explore prompt, sound, visit-bests, and seeded random helper. Each included module must reach at least 90% lines, branches, and functions. The type-only `types.ts` module is intentionally outside the runtime coverage denominator; no executable critical module is excluded.

`npm run test:e2e` builds the learner production artifact and tests it through Vite preview on port 4173. The accessibility suite uses the same production artifact and its own preview port (4174), with desktop Chromium and mobile WebKit. The host-lifecycle suite uses a separate test-only build and port (4175), so the local harness is not included in the learner artifact. Browser `console.error` and uncaught page errors fail every browser suite; Playwright retries are explicitly disabled so reruns cannot conceal the first failure. Install the Playwright Chromium and WebKit browsers once when needed:

```text
npx playwright install chromium webkit
```

`npm run test:a11y` builds the production artifact and runs axe, target-size, keyboard, reduced-motion, reflow, and network checks against desktop Chromium and mobile WebKit. Its current state coverage includes setup, Guided, Challenge, reveal/feedback, Explore zoom, and summary. GAME-220 wait-for-me reveal and GAME-235 hidden-tab pause coverage remain outstanding until those behaviors land; do not use this partial matrix as final accessibility-release evidence. Owner-observed NVDA/VoiceOver verification remains a separate GAME-224 gate.

Pull requests and pushes always run typecheck, lint, unit/coverage checks, both builds, IP separation, and bundle assertions. The desktop/mobile browser and accessibility suites are skipped only for documentation-only changes; `workflow_dispatch` runs the full matrix even for docs-only commits when release evidence needs it. Browser jobs reuse the uploaded learner production build. Coverage, build, browser reports/traces, and a JSON CI-evidence manifest are attached to the exact workflow SHA. The manifest records the source SHA, tested workflow SHA, lockfile hash, Node/npm/Playwright/Vitest and pinned Chromium/WebKit versions, build hash, coverage totals, and individual gate outcomes; GitHub retains these artifacts for 90 days, so GAME-224 must preserve durable release evidence in its checked-in manifest.

The IP scan checks `src/`, `public/` when present, `index.html`, and the production bundle. Benchmark/provenance documentation and tests are separate from shipped source; GAME-222's comparison ledger remains its own deferred story. The bundle gate restricts direct learner runtime dependencies to React and React DOM and rejects known game-engine, WebGL/Unity, and browser-observability runtimes.

The app is intentionally privacy-minimal: game state and visit bests remain in React memory for the current page session. There are no accounts, trackers, telemetry, Sentry, gameplay network calls, or child-data persistence. The production build uses relative asset URLs so the immutable bundle can be served safely from a versioned games-site subpath; see [`docs/GAMES_SITE_RELEASE.md`](docs/GAMES_SITE_RELEASE.md).

## Ownership boundaries

- This repository owns Number Line Jumper source, deterministic engine, tests, build, and release artifact.
- `setnessconsulting/games-site` owns the public arcade catalog, presentation, immutable version pointer, promotion, and rollback.
- LevelBest can consume the host-agnostic v1 contract without importing game internals; its lesson/session integration remains a separate host-owned change.
- The old LevelBest source paths are provenance references only and are no longer the implementation authority after this bootstrap.

## Verification record

The final verification commands and results for the committed target state are maintained in [`docs/PARITY.md`](docs/PARITY.md). A clean clone is expected to pass dependency installation from `package-lock.json`, typecheck, lint, unit tests, production build, and browser smoke without access to LevelBest.
