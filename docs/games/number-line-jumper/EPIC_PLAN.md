# GAME-3 — Implementation Plan

## Repository ownership

- `setnessconsulting/game-number-line-jumper`: source, tests, build, docs, release identity.
- `setnessconsulting/games-site`: arcade catalog, routing, selected production version, promotion, rollback.
- LevelBest: placement/session-plan/lesson-break/parent host surfaces through GAME-292.
- Jira GAME-3: requirements, dependency order, acceptance gates.

## Foundation

1. **GAME-291 — Done.** Standalone bootstrap/parity. Provenance source: `setnessconsulting/levelbest@38a9dfa78e8c1cef2238ba27fd058fc3d9f8a683`; target bootstrap PR #1.
2. **GAME-292 — Done.** Typed/versioned host contract.
3. **GAME-293 — Blocked.** Static-web games-site contract and non-promoted routes are implemented on canonical main; `main-0c87b2a` is built but not published, and its versioned asset currently returns 404.

## Quality and design

- GAME-217 — In Progress; automated accessibility coverage is implemented in PR #10. Owner screen-reader validation remains a GAME-224 gate.
- GAME-218 — Done; CI/browser/coverage/console/IP gates.
- GAME-219 — In Progress; cross-browser performance budgets and rendering evidence are recorded. Two local Chromium performance probes failed their thresholds; hosted PR and post-merge CI passed.
- GAME-220 — Backlog; learner-paced reveal and announcement integrity are implemented and hosted browser checks passed. Recommend Done for automated acceptance; final owner screen-reader acceptance remains under GAME-224.
- GAME-221 — Wont Do for the Figma-specific child claim; owner-selected repository UX/motion documentation remains authoritative, with no Figma file or comparison claimed.
- GAME-222 — Backlog; the benchmark remediation ledger is complete. Recommend Done.
- GAME-223 — Wont Do; the owner withdrew the child-interaction claim. The bounded protocol and explicit not-run record are retained in `docs/NUMBER_LINE_JUMPER_PLAYTEST_PROTOCOL.md`.
- GAME-224 — Blocked; final release acceptance requires exact-candidate publication and owner device and screen-reader evidence.

The exact production candidate and current release-gate state are recorded in
[`RELEASE_ACCEPTANCE.json`](./RELEASE_ACCEPTANCE.json). It remains pending
until the owner device and screen-reader gates are observed against that exact
candidate.

## Game-design work

- GAME-229 — **Won't Do**; scored zoom declined, Explore-only boundary retained.
- GAME-230 — Backlog; accuracy-correlated reveal motion and reduced-motion behavior are merged in PR #11. Recommend Done.
- GAME-231 — Done; deterministic Explore prompt fix.
- GAME-232 — Done; this design package.

## Curriculum / host integration

GAME-233 (Backlog; pure game-side CCSS alignment catalog, complete; recommend Done); GAME-234 (Backlog; completion/session-plan, external host dependency); GAME-235 (Backlog; standalone session clock, complete; recommend Done); GAME-225 (Backlog; placement mapping, external host dependency); GAME-226 (Backlog; earned-break integration, external host dependency); GAME-227 (Backlog; guarded session records, implementation complete; recommend Done); GAME-228 (Backlog; on-device parent-brief/event contract, external host dependency); GAME-355 (Backlog; coaching defect fixed in PR #21; recommend Done); GAME-409 (Backlog; human F1 landing/feedback observation remains).

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
