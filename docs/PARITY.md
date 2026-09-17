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
- Target extraction commit: recorded after the first bootstrap commit

## Component disposition

| Component or behavior | Disposition | Notes |
| --- | --- | --- |
| `src/lib/numberLineJumper/types.ts` | copied unchanged | Pure domain types. |
| `src/lib/numberLineJumper/engine.ts` | mechanical standalone adaptation | Source logic is unchanged; the required shared PRNG remains local under `src/lib/games/shared/rng.ts`. |
| `src/lib/numberLineJumper/adaptive.ts` | copied unchanged | Seeded, bounded, current-run-only adaptation. |
| `src/lib/numberLineJumper/aggregates.ts` | copied unchanged | Session aggregate contract; no persistence or transport. |
| `src/lib/numberLineJumper/visitBests.ts` | copied unchanged | React page-session bests support. |
| `src/lib/numberLineJumper/sound.ts` | mechanical standalone adaptation | Source logic is unchanged; the alias resolves inside this repository. Web Audio remains opt-in. |
| `src/app/games/NumberLineJumper.tsx` | mechanical standalone adaptation | Shipping React surface retained at the same app path; host callback remains the existing `onExit` seam. |
| Number Line Jumper unit tests | copied with path-preserving relocation | Tests remain executable parity evidence under `tests/`. |
| Browser smoke tests | adapted from executable source flow | Hub navigation was removed because it is LevelBest host code; waits use observable UI state rather than fixed sleeps. |
| `src/lib/games/shared/rng.ts` | minimum shared primitive copied | Required because the shipping engine re-exports the established `mulberry32` implementation. |
| LevelBest hub, pilot, routing, auth, APIs, storage, analytics, and unrelated games | intentionally excluded | Host/application infrastructure is outside GAME-291. |
| Typed host contract | deferred to GAME-292 | No direct LevelBest integration is introduced. |
| games-site static release/promotion/rollback | deferred to GAME-293 | No public hosting mutation is introduced. |
| Automated accessibility/CI expansion, performance, design, benchmark, and integration stories | deferred | GAME-217, GAME-218, GAME-219, GAME-220, GAME-221, GAME-222, GAME-223, GAME-224, GAME-225 through GAME-235 remain downstream. |
| Scored zoom | intentionally excluded | GAME-229 remains Won't Do; only the existing unscored Explore zoom is present. |

## Known variance

There is no known behavior-affecting variance from source commit `38a9dfa`. The standalone changes are limited to the Vite entry point, local file placement, alias resolution, extraction of only the game CSS rules, removal of LevelBest hub navigation from the browser harness, and replacement of timing sleeps with UI-observable waits. The game callback still exits to a fresh standalone setup view.

The standalone shell does not implement the LevelBest host callback contract; that is an intentional GAME-292 deferral, not a gameplay variance.

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

Results will be filled with the exact clean-clone run after the extraction commit. The baseline CI workflow is credential-free and runs `npm ci`, typecheck, lint, unit tests, and build.
