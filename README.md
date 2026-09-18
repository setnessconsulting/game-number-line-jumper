# Number Line Jumper

Standalone implementation authority for **Jira GAME-3 — Number Line Jumper**.

## Active documentation

The canonical product/design/architecture package is:

- `docs/games/number-line-jumper/REQUIREMENTS.md`
- `docs/games/number-line-jumper/UX_DESIGN.md`
- `docs/games/number-line-jumper/PROTOTYPE_NOTES.md`
- `docs/games/number-line-jumper/EPIC_PLAN.md`
- `docs/games/number-line-jumper/SPRINT_READINESS.md`
- `docs/games/number-line-jumper/BENCHMARK_REVIEW.md`

Supporting flat documents remain for specialized evidence/contract detail:

- `docs/PARITY.md` — GAME-291 source provenance and extraction/parity evidence.
- `docs/HOST_CONTRACT.md` — GAME-292 host-contract detail.
- `docs/GAMES_SITE_RELEASE.md` — GAME-293 build/publication mechanics.

Those supporting files do not supersede the active package and must not be treated as evidence that downstream gates have passed.

## Source provenance

The standalone baseline was extracted under GAME-291 from `setnessconsulting/levelbest` `main` at exact source SHA `38a9dfa78e8c1cef2238ba27fd058fc3d9f8a683`. The bootstrap and parity evidence are recorded in `docs/PARITY.md`.

## Repository boundaries

This repository owns game source, tests, production build, immutable release identity, and release evidence. `setnessconsulting/games-site` owns public arcade presentation, selected production version, routing, promotion, and rollback. LevelBest integrates only through the typed host boundary documented in `docs/HOST_CONTRACT.md`.

## Local development

Use the scripts defined in `package.json` for install, development, typecheck, lint, unit tests, browser tests, accessibility tests, and production build. CI is the authoritative automated gate for pushed commits.

## Privacy posture

No remote gameplay telemetry, third-party learner tracking, account identity, or Sentry browser SDK is authorized. Session-scoped local behavior and host facts must follow their owning GAME stories and fail closed when their prerequisites are absent.
