# Number Line Jumper — Sprint Readiness

## Policy

The GAME project does not expose the generic Jira Delivery Stage field. GAME-3 uses the documented `readiness-policy-exception`: readiness is determined by clear repository authority, resolved product decisions, explicit dependencies, named ownership, complete acceptance criteria, and at least one unblocked executable child.

Historical Sprint 2/3 readiness notes are not current authority.

## Foundation state

- GAME-291: Done — standalone repo/provenance/parity established.
- GAME-292: Done — host boundary established.
- GAME-218: Done — CI/browser/coverage/console/IP gate wiring.
- GAME-231: Done — Explore prompt determinism fix.
- GAME-293: engineering implementation landed; release publication evidence still pending later qualification.

## Current executable work

Engineering may continue on open quality/design/integration children whose explicit prerequisites are satisfied. A story should not wait for GAME-293 production promotion unless it actually depends on a hosted frozen candidate.

## Known non-engineering gates

- GAME-221 cannot be called Done without a real recorded Figma fileKey and implementation review.
- GAME-223/224 owner-observed device, screen-reader, and child-protocol evidence cannot be synthesized from automation.
- GAME-293 final publication/rollback cannot be claimed until an immutable qualified candidate is actually published and exercised.

## Release readiness

The release candidate is not frozen today. Therefore production promotion, rollback rehearsal, and final acceptance are **PENDING**, not failed and not passed.
