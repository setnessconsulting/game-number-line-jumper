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

The React shell in `src/app/games/NumberLineJumper.tsx` preserves the shipping Guided, Challenge, and Explore paths, including whole numbers, fractions, decimals, negatives, accessibility semantics, reduced-motion behavior, opt-in Web Audio, and page-session-only visit bests. Its optional v1 host prop is documented in [`docs/HOST_CONTRACT.md`](docs/HOST_CONTRACT.md); host-specific application wiring remains outside this repository. Explore zoom remains unscored; GAME-229 scored zoom is not implemented.

GAME-292 establishes the standalone host boundary and local integration harness. This repository still does not implement LevelBest-specific lesson wiring or games-site publication/promotion/rollback (GAME-293); those and the downstream quality stories remain separately scoped.

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

`npm run test:e2e` builds a preview bundle with the local-only host harness, starts Vite preview, and runs the standalone browser journeys. The normal `npm run build` excludes the harness from the release artifact. Install the Playwright Chromium browser once when needed:

```text
npx playwright install chromium
```

The app is intentionally privacy-minimal: game state and visit bests remain in React memory for the current page session. There are no accounts, trackers, telemetry, Sentry, gameplay network calls, or child-data persistence.

## Ownership boundaries

- This repository owns Number Line Jumper source, deterministic engine, tests, build, and release artifact.
- `setnessconsulting/games-site` owns the public arcade catalog, presentation, immutable version pointer, promotion, and rollback.
- LevelBest can consume the host-agnostic v1 contract without importing game internals; its lesson/session integration remains a separate host-owned change.
- The old LevelBest source paths are provenance references only and are no longer the implementation authority after this bootstrap.

## Verification record

The final verification commands and results for the committed target state are maintained in [`docs/PARITY.md`](docs/PARITY.md). A clean clone is expected to pass dependency installation from `package-lock.json`, typecheck, lint, unit tests, production build, and browser smoke without access to LevelBest.
