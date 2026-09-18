# Number Line Jumper — Requirements

This directory is the active design/architecture package for GAME-3. Jira remains the requirements and gate authority; this repository is the implementation authority.

## Product outcome

Deliver a standalone, deterministic number-line estimation game for phone-first use. The game runs independently, exposes one optional host contract, and is published to the public arcade through `setnessconsulting/games-site`.

## Modes and session shape

- **Guided** — scaffolded warm-up.
- **Challenge** — bounded scored round: 60 seconds or 10 completed trials, whichever occurs first.
- **Explore** — untimed, unscored sandbox with multi-scale zoom/pan and deterministic prompt generation.
- Scored Guided/Challenge zoom is intentionally **not** supported. GAME-229 is Won't Do; Explore remains the zoom surface.

## Bands and representations

The engine supports four placement/grade bands covering whole numbers, fractions including improper/mixed forms, decimals, and negatives. The g5–8 Challenge path may mix representations within one run.

## Mathematical authority

The pure TypeScript engine is the sole authority for targets, represented value, scoring, aggregates, and adaptive rhythm. Rendered coordinates never define mathematical state.

Scoring uses relative absolute error:

`abs(playerValue - targetValue) / (range.max - range.min)`

with the established 5% / 15% closeness bands and 10 / 6 / 2 point awards.

Same seed + same state + same completed-trial sequence must produce the same targets, scores, and aggregates regardless of viewport, DPR, CSS, or host application.

## Accessibility and responsive requirements

- semantic slider behavior with represented-value text;
- complete pointer, touch, and keyboard operation;
- live feedback/reveal announcements;
- focus movement that preserves task context;
- minimum 48 px interactive targets;
- 200% reflow without horizontal content loss;
- reduced-motion parity;
- truth/marker distinction that does not depend on color;
- phone portrait primary, with phone landscape, tablet, and desktop supported.

GAME-217 owns automated accessibility coverage. GAME-224 owns final owner-observed screen-reader/device acceptance. No owner-only result may be inferred from authored docs or automation.

## Privacy and persistence

- no accounts, child profiles, third-party trackers, or remote gameplay telemetry;
- no Sentry browser SDK on the learner path;
- session/tab-scoped records are allowed only through GAME-227's guarded schema/fail-closed contract;
- on-device parent-brief facts may exist under GAME-228 but are not remotely transmitted by the game;
- ordinary first-party static asset delivery through games-site is allowed.

## Host and release boundaries

GAME-292 defines the only supported typed/versioned host seam. Free standalone play must work without a host.

`game-number-line-jumper` owns source, tests, builds, release identity, and immutable release evidence. `games-site` owns arcade presentation, selected production version, routing, promotion, and rollback.

GAME-293 has landed the static-web release contract and non-promoted Number Line Jumper routes, but production promotion/rollback evidence remains pending until a validated frozen candidate exists.
