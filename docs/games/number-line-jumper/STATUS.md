# Number Line Jumper — Package Status

Last reviewed: 2026-10-02

## Current state

- **GAME-219 machine qualification is complete and green against exact main `72dc666ed935fba1a20d9f82aef69d384c2cf0dc`.** All ten acceptance criteria pass. No code change was required, so no PR exists for it and the qualified tree is byte-identical to `72dc666`.
- **`main` has advanced past the qualified SHA, but nothing game-affecting has changed.** As of this review every commit after `72dc666` is CI or documentation only and touches no build input — `0e1eba1` (`ci: cap every job with an explicit timeout`, PR #29, `.github/workflows/ci.yml`) and `7313399` (this file). `package.json`, `package-lock.json`, `vite.config.ts`, and `index.html` were re-verified byte-identical between `72dc666` and `main`, so the qualification and the built payload both remain valid. **The accepted identity stays `72dc666` / `main-72dc666`; do not re-cut the version just because `main` moved.** Before publishing, re-run that same four-file identity check rather than assuming it still holds.
- The qualified build is prepared as immutable version **`main-72dc666`**. `sourceSha` `72dc666ed935fba1a20d9f82aef69d384c2cf0dc`, `lockfileSha256` `2aef9fda593a7bc50dcf93868f19450520def854e03bb91d462dca0ed0e7e1dc`, `buildSha256` `2f38ef2c51171f78164a4df35c968a63721be3e3eaf295421b2785affcd19932`.
- Payload: `index.html` 505 B sha256 `7c78806c0d9d81e48000d5719bb8d007ec241372e641e6256a6b30c4f901ce52`; `assets/index-C8kEDWX0.js` 260955 B sha256 `1dfbee8fc23f7690e77c98c520836be6d20850d0e1095053892126606361c587`; `assets/index-COlel_o9.css` 15595 B sha256 `d090fd84d560a48f1599fa6e5e49d88309f24d4da10f1b18fde3f76ba4c818c2`.
- **The release manifest is not in git.** `release-evidence/` is gitignored in this repository, so `release-evidence/number-line-jumper-main-72dc666.json` exists only in the qualification worktree and in the session evidence archive. Copy it out before deleting any worktree.
- **Publication is blocked on an owner credential, not on engineering.** The game is already live and playable at <https://games.setnessconsulting.com/number-line-jumper/>, serving `main-12641c0` via games-site PR #13. The catalog entry is already `status: playable`. There is no pending coming-soon → playable flip; the only remaining step is publishing and selecting the newer qualified build.
- The prior `main-12641c0` promotion and rollback rehearsal remain valid evidence for that prior version only. They do not qualify the new source.
- GAME-222's fifteen-dimension benchmark ledger is complete at [`../../NUMBER_LINE_JUMPER_QUALITY_REVIEW.md`](../../NUMBER_LINE_JUMPER_QUALITY_REVIEW.md). Its external comparisons are mechanic descriptions only, not product rankings.
- GAME-223's child-interaction claim was withdrawn. The protocol and explicit not-run record remain in [`../../NUMBER_LINE_JUMPER_PLAYTEST_PROTOCOL.md`](../../NUMBER_LINE_JUMPER_PLAYTEST_PROTOCOL.md); no child study is claimed.

## Qualification evidence — GAME-219 on `72dc666`

| AC | Budget | Measured | Result |
| --- | --- | --- | --- |
| 1 | Tick labels anchored to values | every label centre within 1.5 px of its tick | PASS |
| 2 | Compositor transform, reduced motion | `transform` not `left`; reduced → `0s` / `none` | PASS |
| 3 | Pointer frame p95 typical ≤16 ms | 1.30 ms frame, 219/220 | PASS |
| 3 | Pointer frame p95 6× CPU ≤50 ms | 7.20 ms frame, 219/220 | PASS |
| 4 | Reveal transition p95 ≤200 ms | 3.20 ms, 9/10 trials | PASS |
| 5 | Lighthouse mobile LCP ≤2500 ms | median 1410.70 ms | PASS |
| 5 | CLS ≤0.1 | 0 | PASS |
| 5 | Field INP | UNKNOWN/PENDING | recorded, not claimed |
| 6 | Long tasks ≤50 ms | max 0 ms, zero entries | PASS |
| 7 | Bundle baseline | 78782 B gzip vs 78736 B (+46 B, +0.06%), allowed +4096 B | PASS |
| 7 | Excluded runtimes | no pixi/phaser/sentry/etc.; only react + react-dom | PASS |
| 8 | Size delta reported | raw −157 B, gzip +46 B (+0.06%) | PASS |
| 9 | Cross-browser | 34 passed / 2 designed skips | PASS |
| 10 | Commit-bound, no telemetry | all from `72dc666`; zero sendBeacon/fetch/XHR/WebSocket/gtag/dataLayer | PASS |

- Field INP stays **UNKNOWN/PENDING**. The route has no eligible CrUX sample, and the zero-third-party-transmission policy forbids adding a beacon, remote performance SDK, or learner telemetry to manufacture one.
- The historical 17.8 ms / 76.2 ms excursions recorded for the superseded `main-0c87b2a` candidate did not reproduce and are retained as historical workstation measurements, not as a waiver.
- Manual session-payload inspection found the documented session key and gameplay fields only, no identifier-like keys, no cookies, and no external request origins.
- **Stale artifact:** [`RELEASE_ACCEPTANCE.json`](./RELEASE_ACCEPTANCE.json) still describes the superseded `main-0c87b2a` candidate and is dated `2026-09-26`. Its `decision` of `NOT_DONE_PENDING_OWNER_GATES` is still correct, but its `candidate` block is not current and must not be read as the `main-72dc666` record. Refreshing it is an open task; the authoritative `main-72dc666` identity is the one recorded in *Current state* above.

## Build reproducibility

The Windows checkout has `core.autocrlf=true`, so Vite emits mixed line endings in `dist/index.html` (12 CRLF plus one lone CR, 517 B). Windows line endings change `index.html` bytes and therefore the recorded `buildSha256`. The entry file was normalized to LF-only before generating release evidence, producing 505 B with no CR remaining, matching the 504 B entry size recorded for the prior canonical Linux artifact. JS and CSS payloads are byte-identical across platforms.

**If you rebuild, you must re-normalize before regenerating evidence or `buildSha256` will not match.** The game's CI workflow does not run `release:evidence`, so no hosted Linux verification artifact exists for this SHA. Adding an Ubuntu CI job that runs `npm run release:evidence` and uploads the artifact would remove this manual step permanently.

## Publication blocker — owner credential required

R2 object `PUT` is rejected with HTTP 403, Cloudflare error code 10000 `Authentication error`. R2 read and object listing both succeed, so the failure is a permission scope, not a path or content fault. Nothing has been published, overwritten, or deleted.

Credential state, presence and length only, never values:

| Credential | State |
| --- | --- |
| `Setness.AI.shared.CLOUDFLARE_BUSINESS_TOKEN` | present, 53 chars, verify active, resolves exactly one account `0bc1e128…fc21ed` |
| …R2 write | **403 — read-only scope** |
| `CLOUDFLARE_ACCOUNT_ID` (any probed target) | absent |
| `Setness.AI.shared.CLOUDFLARE_PERSONAL_TOKEN` | present, 53 chars, verify HTTP 401 |
| `Setness.AI.shared.CLOUDFLARE_BUSINESS_MCP_TOKEN` | present, 53 chars, verify HTTP 401 |
| `Setness.AI.shared.CLOUDFLARE_BUSINESS_MCP_TOKEN.api-210-candidate-20260918` | present, 86 chars, verify HTTP 400 |
| `GET /user/tokens` | 403 — cannot mint or inspect a replacement |
| `GAME_PLATFORM_SDK_DEPLOY_KEY` (any probed target) | absent |

**Owner action to unblock:** create a Cloudflare API token for account `0bc1e1287ce80d7065f40c4c72fc21ed` with **Account → R2 Storage → Edit**, store it in the Windows vault under an allowlisted target, add a `CLOUDFLARE_ACCOUNT_ID` binding for that account, and restore the allowlisted `cloudflare-business` profile binding.

### R2 route gotcha — read this before retrying

The R2 object API for this portfolio is **account-scoped**:

```text
/client/v4/accounts/{account_id}/r2/buckets/{bucket}/objects/{key}
```

The bare route `/client/v4/r2/buckets/{bucket}/objects/{key}` does not exist and returns **HTTP 400, Cloudflare code 7000, `No route for that URI`**. That 7000 is returned identically **with no `Authorization` header at all**, so it is a wrong-URL signal, not an authorization decision and not a transient outage. Do not treat it as retry-worthy intermittent failure. The genuine missing-scope signal is 403 / code 10000 on the account-scoped route. This matches the R2 adapter in `setnessconsulting/project-cloudflare-api`, which is a read-only control plane and must not be used for publication.

## Publish path once write scope exists

1. Preflight every target key with a remote read and **refuse to publish if any key already exists**. Never overwrite or delete a published version directory.
2. Upload `assets/` objects first and **`index.html` last**, so a partial version is never selectable.
3. Read every object back and verify its sha256 against the manifest before declaring success.
4. In `games-site`, change only `NUMBER_LINE_JUMPER_PRODUCTION_VERSION` in `src/data/games.ts` from `main-12641c0` to `main-72dc666`. Leave `NUMBER_LINE_JUMPER_PREVIEW_VERSION` unset for production. Do not hand-edit `status`; it is already `playable`. Do not rebuild the game inside games-site.
5. Verify `…/game-assets/number-line-jumper/main-72dc666/index.html` returns 200, `…/number-line-jumper/play/` returns 200 and actually plays, and the `main-12641c0` objects are still present for rollback.

## Remaining gates

1. **Owner:** supply the R2 write-scoped Cloudflare credential above. Everything else in the publish path is ready.
2. Owner-observed desktop plus Android or iOS interaction against the exact promoted version. No current-candidate device observation exists. The 2026-09-18 device observation was against `pr8-c7428853083f`, not this candidate, so it does not satisfy this gate.
3. Owner-observed NVDA or VoiceOver validation against the exact promoted version. Automated accessibility is not a substitute.
4. GAME-409's human F1 landing/feedback check against the exact promoted version. Existing automated observations are not a human playtest.
5. LevelBest remains intentionally configured `no-games`; the actual placement-to-game, earned-break return, parent surface, and session-plan journey stories require that owning repository's later authorized game enablement.
6. Refresh `RELEASE_ACCEPTANCE.json` from the superseded `main-0c87b2a` record to `main-72dc666`.
7. Consider an Ubuntu CI job that runs `npm run release:evidence` so the hosted Linux artifact is authoritative and the manual line-ending normalization step disappears.

## Open pull requests

- **#28 `codex/sdk10-nlj-adoption-20261002` (draft)** — SDK-10 game-side pilot. Its `verify` job fails in ~7 s at a deliberate fail-closed guard that requires the `GAME_PLATFORM_SDK_DEPLOY_KEY` repository Actions secret to install the private Game Platform SDK. The repository currently has **no Actions secrets at all**, and the key is not in the Windows vault. Owner action: add the existing read-only SDK key as that repository secret. The guard was not weakened. Contained: draft only, `main` is unaffected, and the other jobs (`changes`, `evidence`) pass while `browser`/`performance` are skipped behind the failure.

## Jira snapshot

GAME-219 is In Progress with only the owner device gates outstanding. GAME-224 and GAME-293 are Blocked. GAME-3 remains In Progress. No ticket was transitioned or closed during the `main-72dc666` qualification or the blocked publication attempt; the open owner gates are unchanged.

## Explicit scope decisions

- GAME-221 uses the owner-selected checked-in repository UX/motion authority; no Figma file exists and no Figma comparison is claimed.
- GAME-223 is Won't Do because the owner withdrew child interaction testing; the protocol remains explicitly not run.
- GAME-229 is Won't Do; scored zoom remains declined and Explore-only zoom remains.
- No production release or maintenance-ready claim is made for `main-72dc666` until the remaining owner credential, device, screen-reader, and GAME-409 gates are resolved.
