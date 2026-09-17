# Number Line Jumper

This repository is the authoritative implementation, build, test, and release-artifact source for Number Line Jumper under GAME-3. It is a standalone React + TypeScript application and does not require the historical LevelBest repository.

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

The React shell in `src/app/games/NumberLineJumper.tsx` preserves the shipping Guided, Challenge, and Explore paths, including whole numbers, fractions, decimals, negatives, accessibility semantics, reduced-motion behavior, opt-in Web Audio, and page-session-only visit bests. Explore zoom remains unscored; GAME-229 scored zoom is not implemented.

This bootstrap intentionally does not implement the typed LevelBest host boundary (GAME-292), games-site publication/promotion/rollback (GAME-293), or the downstream quality and integration stories.

## Development

Required runtime: Node.js `24.x` (see `.nvmrc`).

```text
npm ci
npm run dev
npm run typecheck
npm run lint
npm test
npm run build
npm run test:e2e
```

`npm run test:e2e` builds the production bundle, starts Vite preview, and runs the standalone browser smoke suite. Install the Playwright Chromium browser once when needed:

```text
npx playwright install chromium
```

The app is intentionally privacy-minimal: game state and visit bests remain in React memory for the current page session. There are no accounts, trackers, telemetry, Sentry, gameplay network calls, or child-data persistence.

## Ownership boundaries

- This repository owns Number Line Jumper source, deterministic engine, tests, build, and release artifact.
- `setnessconsulting/games-site` owns the public arcade catalog, presentation, immutable version pointer, promotion, and rollback.
- LevelBest host integration will be implemented through the later typed host boundary in GAME-292.
- The old LevelBest source paths are provenance references only and are no longer the implementation authority after this bootstrap.

## Verification record

The final verification commands and results for the committed target state are maintained in [`docs/PARITY.md`](docs/PARITY.md). A clean clone is expected to pass dependency installation from `package-lock.json`, typecheck, lint, unit tests, production build, and browser smoke without access to LevelBest.
