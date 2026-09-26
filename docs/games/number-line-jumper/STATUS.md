# Number Line Jumper — Package Status

Last reviewed: 2026-09-26

## Current state

- The frozen `main-0c87b2a` candidate was built from canonical `main` commit `0c87b2abb0854ff99565ff4e16ce48ed1aa088d0`.
- PR #21 merged the GAME-355 coaching fix. Large whole-number hints now name nearby anchors; cross-zero hints follow the target's actual sign. The regression cases cover 173, 514, an exact 500 anchor, fractions, decimals, mixed Challenge targets, and both signs.
- The canonical candidate artifact is the hosted Linux build for source SHA `0c87b2abb0854ff99565ff4e16ce48ed1aa088d0`; its lockfile, release-manifest, build, and payload hashes are recorded in [`RELEASE_ACCEPTANCE.json`](./RELEASE_ACCEPTANCE.json). The Windows build differs only in `index.html` line endings, so it is not the publication payload. The candidate has not been published to games-site.
- Live readback on 2026-09-26 found the launcher still selects `main-12641c0` (HTTP 200); that version's entry asset returns 200 and `main-0c87b2a` returns 404. The readback was repeated during this qualification pass. No new-version promotion or production deployment occurred.
- The prior `main-12641c0` promotion and rollback rehearsal remain valid evidence for that prior version only. They do not qualify the new source.
- GAME-222's fifteen-dimension benchmark ledger is complete at [`../../NUMBER_LINE_JUMPER_QUALITY_REVIEW.md`](../../NUMBER_LINE_JUMPER_QUALITY_REVIEW.md). Its external comparisons are mechanic descriptions only, not product rankings.
- GAME-223's child-interaction claim was withdrawn. The protocol and explicit not-run record remain in [`../../NUMBER_LINE_JUMPER_PLAYTEST_PROTOCOL.md`](../../NUMBER_LINE_JUMPER_PLAYTEST_PROTOCOL.md); no child study is claimed.

## Qualification evidence

- PR #21 hosted `changes`, `verify`, `browser`, and `evidence` checks passed on head `4b6324334578c13219f0a6ef9b317f60ac4884a0`. Post-merge `main` CI run [36212649395](https://github.com/setnessconsulting/game-number-line-jumper/actions/runs/36212649395) passed on exact merge commit `0c87b2abb0854ff99565ff4e16ce48ed1aa088d0`.
- Local typecheck, lint, 268-test coverage suite, production and host-test builds, IP and bundle guards passed. The learner JavaScript gzip budget was 78,965 bytes against a 78,736-byte baseline (+229 bytes, 0.29%).
- The complete `npm run test:ci` command passed on 2026-09-26: 37 E2E tests passed with 2 expected skips, 12 accessibility tests passed, 6 host tests passed, and all build, type, lint, coverage, bundle, IP, and performance stages passed. Its Chromium probes recorded 15.8 ms typical drag p95 and 14.0 ms under 6x CPU, with no task over 50 ms and reveal checks passing.
- Focused engine suite: 43 passed. Accessibility: 12 passed across desktop Chromium and mobile WebKit. Host contract: 6 passed.
- The earlier isolated local browser run had 35 passes, 2 skips, and two Chromium performance excursions (p95 17.8 ms vs 16 ms; under 6x CPU p95 76.2 ms vs 50 ms, with long tasks). A later three-repeat Chromium performance-suite retest passed 9/9: typical p95 was 14.9–15.4 ms, 6x CPU p95 was 15.0–24.3 ms, and no >50 ms long tasks were observed. Reveal timing checks passed. No game code or performance budget changed; the earlier readings remain historical rather than waived.
- The local Lighthouse run remains partial because Windows Chrome profile cleanup returned `EPERM` after one sample (LCP about 1.50 s). Hosted Linux CI run `36212649395` completed all three Lighthouse runs and passed its LCP/CLS assertions on the exact candidate SHA. Its raw `.lighthouseci` reports were not retained in the artifact, so no numeric median is recorded. The CI workflow change in this branch now retains that hidden report directory; hosted verification is pending.
- The Cloudflare auth preflight could not load an allowlisted credential from the `cloudflare-business` profile. No R2 query, object upload, or Pages deployment change was made; the production pointer remains untouched.
- Manual session-payload inspection found the documented session key and gameplay fields only, no identifier-like keys, no cookies, and no external request origins. That inspection was on the PR #21 candidate tree before merge; the merge changed coaching only.

## Remaining gates

1. Restore the allowlisted Cloudflare business credential profile, then publish the exact immutable hosted Linux build through the games-site preview path without overwriting `main-12641c0`; verify the new versioned entry and assets, route, and preview rollback path.
2. Complete owner-observed desktop plus Android or iOS interaction against the exact candidate. No current-candidate device observation exists.
3. Complete owner-observed NVDA or VoiceOver validation against the exact candidate. Automated accessibility is not a substitute.
4. Complete GAME-409's human F1 landing/feedback check. Existing automated observations are not a human playtest.
5. LevelBest remains intentionally configured `no-games`; the actual placement-to-game, earned-break return, parent surface, and session-plan journey stories require that owning repository's later authorized game enablement.

## Jira snapshot

The 2026-09-26 readback found GAME-3 In Progress and all 31 children: 12 Done (GAME-4 through GAME-10, GAME-218, GAME-231, GAME-232, GAME-291, GAME-292); 3 Wont Do (GAME-221, GAME-223, GAME-229); 2 In Progress (GAME-217, GAME-219); 2 Blocked (GAME-224, GAME-293); and 12 Backlog (GAME-220, GAME-222, GAME-225 through GAME-228, GAME-230, GAME-233 through GAME-235, GAME-355, GAME-409). Closeout comments were added to the Epic and each child that was open before this reconciliation. Only the two owner-withdrawn scopes were transitioned to Wont Do; Done transitions remain gated on independent review.

## Explicit scope decisions

- GAME-221 uses the owner-selected checked-in repository UX/motion authority; no Figma file exists and no Figma comparison is claimed.
- GAME-223 is Won't Do because the owner withdrew child interaction testing; the protocol remains explicitly not run.
- GAME-229 is Won't Do; scored zoom remains declined and Explore-only zoom remains.
- No production release or maintenance-ready claim is made for `main-0c87b2a` until the remaining candidate, owner, and host gates are resolved.
