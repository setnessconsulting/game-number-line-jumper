# GAME-3 — Implementation Plan

## Repository ownership

- `setnessconsulting/game-number-line-jumper`: source, tests, build, docs, release identity.
- `setnessconsulting/games-site`: arcade catalog, routing, selected production version, promotion, rollback.
- LevelBest: placement/session-plan/lesson-break/parent host surfaces through GAME-292.
- Jira GAME-3: requirements, dependency order, acceptance gates.

## Foundation

1. **GAME-291 — Done.** Standalone bootstrap/parity. Provenance source: `setnessconsulting/levelbest@38a9dfa78e8c1cef2238ba27fd058fc3d9f8a683`; target bootstrap PR #1.
2. **GAME-292 — Done.** Typed/versioned host contract.
3. **GAME-293 — In Progress.** Static-web games-site contract and non-promoted routes are implemented on canonical main; final publication/promotion/rollback waits for a validated candidate.

## Quality and design

- GAME-217 — automated accessibility coverage implemented in PR #10; owner screen-reader validation remains a GAME-224 gate.
- GAME-218 — Done; CI/browser/coverage/console/IP gates.
- GAME-219 — cross-browser performance budgets/rendering fixes.
- GAME-220 — Done in PR #10; learner-paced reveal/announcement integrity.
- GAME-221 — repository motion authority selected for this wave; Figma is not required and `MOTION.md` is the checked-in contract.
- GAME-222 — benchmark remediation ledger.
- GAME-223 — **Won't Do** after the owner withdrew the child-interaction claim; the bounded protocol and explicit not-run record are retained in `docs/NUMBER_LINE_JUMPER_PLAYTEST_PROTOCOL.md`.
- GAME-224 — final release acceptance.

## Game-design work

- GAME-229 — **Won't Do**; scored zoom declined, Explore-only boundary retained.
- GAME-230 — Done in PR #11; accuracy-correlated reveal motion and reduced-motion behavior are merged.
- GAME-231 — Done; deterministic Explore prompt fix.
- GAME-232 — this design package.

## Curriculum / host integration

GAME-233 CCSS registry (pure game-side alignment catalog; host inventory update remains separate); GAME-234 completion/session-plan; GAME-235 standalone session clock; GAME-225 placement mapping; GAME-226 earned-break integration; GAME-227 guarded session records (implementation wave); GAME-228 on-device parent-brief/event contract.

## Authoritative order

1. Foundation: 291 → 292, with 217/218/231 and games-site contract work after 291.
2. Quality/design wave: 219 after 218; 220 is complete; repository motion authority (221) precedes 230; then 230/232/233/222 as dependencies allow.
3. Integration wave: 235 + 225 through 292, then 226; 234 through 292; 227 before 228.
4. Re-verify every host-contract consumer after host-side wiring.
5. Freeze the release candidate.
6. Finish GAME-293 immutable publication + hosted qualification + rollback rehearsal.
7. Run owner-only protocol/evidence where retained.
8. Execute GAME-224 against exact game and games-site SHAs.

## Closure rule

No issue may claim downstream gates passed merely because its contract or documentation exists. GAME-224 closes only with a machine-readable evidence manifest whose references resolve to the exact accepted candidate.

## Authority update — 2026-09-19

The owner selected the checked-in UX/design documentation as the authority for GAME-230 because no Number Line Jumper Figma file exists. `UX_DESIGN.md` and `MOTION.md` define the implementation contract and required evidence. This is a repository design-authority decision, not a claim that a Figma alignment gate passed.
