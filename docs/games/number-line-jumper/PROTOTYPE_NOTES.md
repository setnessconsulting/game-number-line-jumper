# Number Line Jumper — Prototype and Architecture Notes

## Authority split

- Pure engine: target generation, represented values, scoring, aggregates, adaptation.
- React/DOM shell: rendering, input normalization, accessibility semantics, opt-in audio.
- GAME-292 host boundary: optional placement/break/completion/parent-brief integration.
- games-site: public arcade presentation and immutable-release selection.

The engine must not read DOM, clock, storage, network, account identity, LevelBest state, or games-site state.

## Deterministic seams

Randomness is seeded and injected. Viewport geometry is normalized before entering mathematical logic. Explore prompt generation is deterministic for a session seed while avoiding immediate repeats.

## Session records

Current page/session behavior is historical baseline only. GAME-227 owns the guarded browser-tab/session-store production contract, including schema/versioning, cleanup, blocked-storage behavior, and fail-closed rules.

## Host contract

GAME-292 is Done. The host contract is JSON-safe, versioned, optional, and host-agnostic. Free play requires no host. Placement mapping remains outside mathematical authority. Outer lesson/break windows remain host-owned.

See `docs/HOST_CONTRACT.md` for the contract-level detail. That file is supporting contract documentation; this package is the active product/architecture source.

## Static-web build and release

GAME-293 added subpath-safe Vite output plus release-evidence generation. A static-web release records an immutable version and entry document. `games-site` supplies the selected versioned asset base and must never require a fake Unity manifest.

See `docs/GAMES_SITE_RELEASE.md` for operational release mechanics. Production publication/rollback remains pending until a qualified candidate exists.

## Observability and privacy

Remote gameplay observability is disabled. No Sentry browser SDK, third-party tracking, child identity, or remote gameplay telemetry is authorized. Local/CI tooling supplies operational evidence.

## Evidence discipline

Authored documents, historical test totals, placeholders, planned wiring, and model summaries are not PASS evidence. A gate is passed only by current resolvable evidence on the candidate to which the claim applies.
