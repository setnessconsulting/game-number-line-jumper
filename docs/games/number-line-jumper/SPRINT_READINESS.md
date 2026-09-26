# Number Line Jumper — Sprint Readiness

## Policy

The GAME project does not expose the generic Jira Delivery Stage field. GAME-3 uses the documented `readiness-policy-exception`: readiness is determined by clear repository authority, resolved product decisions, explicit dependencies, named ownership, complete acceptance criteria, and at least one unblocked executable child.

Historical Sprint 2/3 readiness notes are not current authority.

## Foundation state

- GAME-291: Done — standalone repo/provenance/parity established.
- GAME-292: Done — host boundary established.
- GAME-218: Done — CI/browser/coverage/console/IP gate wiring.
- GAME-231: Done — Explore prompt determinism fix.
- GAME-293: Blocked — the static release contract is implemented, but the current source candidate is not published or exercised through the games-site production route.

## Current executable work

The 2026-09-26 Jira readback found 31 children: 12 Done (GAME-4 through GAME-10, GAME-218, GAME-231, GAME-232, GAME-291, GAME-292); 3 Wont Do (GAME-221, GAME-223, GAME-229); 2 In Progress (GAME-217, GAME-219); 2 Blocked (GAME-224, GAME-293); and 12 Backlog (GAME-220, GAME-222, GAME-225 through GAME-228, GAME-230, GAME-233 through GAME-235, GAME-355, GAME-409). Closeout evidence was added to the Epic and all 18 children that were open at the start of reconciliation. Only GAME-221 and GAME-223 were transitioned; Done transitions remain subject to Jira's independent-review requirement.

Automated qualification for the merged `main-0c87b2a` candidate is complete, including its post-merge hosted CI run. Local Chromium performance probes exceeded their thresholds and the repeated Lighthouse sample did not complete. The candidate has a reproducible build identity, but is not published or qualified through the current games-site release route.

## Known non-engineering and cross-repository gates

- GAME-221 is Wont Do for the Figma-specific child claim. The owner-selected checked-in UX and motion documentation remains the design authority; no Figma file or comparison is claimed.
- GAME-223 is Wont Do because the owner withdrew the child-interaction claim. Its bounded protocol remains explicitly not run.
- GAME-224 remains Blocked pending exact-candidate publication and owner-observed device and screen-reader acceptance.
- GAME-293 remains Blocked pending immutable publication, route and asset readback, and a rollback rehearsal for `main-0c87b2a`.
- GAME-409 still needs a human F1 landing and feedback observation; automated observations are not a human playtest.
- LevelBest remains intentionally configured `no-games`. The actual placement-to-game, earned-break return, parent surface, and session-plan journeys remain with the owning repository and its later authorized game enablement.

## Release readiness

`main-0c87b2a` is built and its source, build, and payload hashes are recorded. Live readback still selects `main-12641c0`; the new versioned asset returns 404. The prior candidate's promotion and rollback evidence applies only to `main-12641c0`. The new candidate is therefore **not maintenance ready**; production promotion and final acceptance remain pending, while the local performance threshold results remain failed evidence.
