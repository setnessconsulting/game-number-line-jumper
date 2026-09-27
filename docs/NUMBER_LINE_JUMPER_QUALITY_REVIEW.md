# Number Line Jumper — Quality Review Ledger

This is the checked-in GAME-222 benchmark and remediation ledger. It is a
product-quality record for the standalone game, not a claim that external
comparators were independently tested in this repository.

## Rating rules

- **Meets** means the repository has a direct implementation or automated
  evidence reference for the stated bar.
- **Exceeds** means the repository has direct evidence that goes beyond the
  stated bar. No row currently uses this rating.
- **Below** means the bar is not met by the current evidence. Every Below row
  has a disposition in the final column.
- An external comparator is `verified-here` only when a route or artifact was
  actually captured and checked in. Otherwise it is
  `described-mechanic-only`, and it cannot support a Meets or Exceeds claim.

## Fifteen-dimension ledger

| # | Dimension | Bar | Rating | Evidence | Decision for Below |
| ---: | --- | --- | --- | --- | --- |
| 1 | Mathematical integration | Guided and Challenge use deterministic target generation, normalized placement, and score calculations across the supported representations. | Meets | `src/lib/numberLineJumper/engine.ts`; `tests/numberLineJumper.test.ts`; `tests/numberLineJumper.mixed.test.ts`; `tests/numberLineJumperAggregates.test.ts` | — |
| 2 | Discoverability and entry | The standalone game has a documented host boundary and can be selected by the games-site catalog without importing LevelBest runtime code. | Meets | `docs/HOST_CONTRACT.md`; `docs/GAMES_SITE_RELEASE.md`; production route evidence is owned by `games-site` and is bound again by GAME-224. | — |
| 3 | Feedback clarity and announcement integrity | Feedback identifies the learner result, preserves numeric truth, and exposes the same result to assistive technology. | Meets | `src/app/games/NumberLineJumper.tsx`; `tests/accessibility/numberLineJumper.a11y.spec.ts`; `tests/e2e/numberLineJumper.spec.ts` | — |
| 4 | Pacing and learner control | Timed feedback uses the locked 900/1100/1400/1700 ms dwell tiers; an opt-in wait-for-me session can continue explicitly without automatic advancement. | Meets | `src/app/games/NumberLineJumper.tsx`; wait-for-me coverage in `tests/accessibility/numberLineJumper.a11y.spec.ts` and `tests/e2e/numberLineJumper.spec.ts`; `docs/games/number-line-jumper/UX_DESIGN.md` | — |
| 5 | Visual communication | Marker, truth, and feedback remain distinguishable without relying on color alone; reveal motion communicates accuracy without changing the numeric result. | Meets | `docs/games/number-line-jumper/MOTION.md`; `tests/numberLineJumperMotion.test.ts`; reduced-motion coverage in `tests/accessibility/numberLineJumper.a11y.spec.ts` | — |
| 6 | Error recovery | A wrong placement provides actionable feedback and the learner can leave, continue, complete a round, or recover from timer/visibility transitions without a stuck state. | Meets | `tests/e2e/numberLineJumper.spec.ts`; `tests/e2e/numberLineJumperHost.spec.ts`; `tests/numberLineJumperSessionClock.test.ts` | — |
| 7 | Accessibility | Automated browser coverage checks semantics, keyboard operation, target sizes, reflow, reduced motion, console/page errors, and mobile WebKit. | Meets | `tests/accessibility/numberLineJumper.a11y.spec.ts`; hosted `browser` evidence is a GAME-224 input; owner NVDA/VoiceOver validation remains a separate release gate. | — |
| 8 | Adaptive potential | Placement results can be consumed by deterministic adaptation and the curriculum mapping remains explicit rather than inferred from UI state. | Meets | `src/lib/numberLineJumper/adaptive.ts`; `src/lib/numberLineJumper/placementAdapter.ts`; `tests/numberLineJumperAdaptive.test.ts`; `tests/numberLineJumperSkills.test.ts` | — |
| 9 | Originality and IP boundary | Shipping source contains no comparator assets or presentation, and provenance/IP checks remain separate from benchmark prose. | Meets | `docs/PARITY.md`; `scripts/check-ip-separation.mjs`; `package.json` `check:ip` script | — |
| 10 | Representation and curriculum | Whole numbers, fractions, decimals, negatives, and the four curriculum bands have an explicit, testable mapping. | Meets | `docs/games/number-line-jumper/CURRICULUM_SKILLS.md`; `src/lib/numberLineJumper/skills.ts`; `tests/numberLineJumper.mixed.test.ts`; `tests/numberLineJumperSkills.test.ts` | — |
| 11 | Scoring and deterministic math | Scoring is pure, finite, normalized, and testable independently of DOM, React, time, storage, network, or host state. | Meets | `src/lib/numberLineJumper/engine.ts`; `tests/numberLineJumper.test.ts`; `tests/numberLineJumperAggregates.test.ts`; `README.md` architecture section | — |
| 12 | Reveal motion and reduced motion | Continuous accuracy-correlated intensity is bounded and deterministic; reduced motion preserves text/numeric feedback while removing transform and reveal animation. | Meets | `docs/games/number-line-jumper/MOTION.md`; `src/app/games/NumberLineJumper.tsx`; `tests/numberLineJumperMotion.test.ts`; accessibility reduced-motion coverage | — |
| 13 | Responsive behavior and performance | Desktop Chromium/Firefox, mobile WebKit, Lighthouse, bundle, pointer, and long-task budgets remain enforced without adding runtime dependencies. | Meets | `docs/PERFORMANCE.md`; `tests/e2e/numberLineJumperPerformance.spec.ts`; `tests/e2e/numberLineJumper.spec.ts`; `package.json` browser/performance scripts; hosted CI evidence | — |
| 14 | Privacy, safety, and non-telemetry | Gameplay has no accounts, trackers, telemetry, cookies, network gameplay calls, or durable child-data storage; session continuity is bounded and documented. | Meets | `tests/numberLineJumperPrivacy.test.ts`; `tests/storage-guard.test.ts`; `docs/games/number-line-jumper/SESSION_RECORDS.md`; `README.md` privacy section | — |
| 15 | Authority, reproducibility, and release boundary | Product behavior has an owner-approved design authority, comparator evidence is reproducible, and the accepted artifact is bound to exact source and host revisions. | Below | `docs/games/number-line-jumper/UX_DESIGN.md` and `MOTION.md` record repository design authority because no Figma file exists; benchmark rows and release contracts are now checked in. A real Figma fileKey/version/page is not available. | **Defer Figma alignment as a Won't Do decision in GAME-221; retain the checked-in repository contract as the implementation authority, make no Figma-alignment claim, and bind exact source/release/host SHAs in GAME-224.** |

## Remediation state

The only Below row is an intentional governance disposition, not an
untracked implementation defect. No row permits an unverified comparator to
support a product-ranking claim. Final release readiness still depends on the
owner-observed GAME-224 gates and the exact release manifest described in
`docs/GAMES_SITE_RELEASE.md`.

## Related records

- Comparator registry and per-comparator bars:
  [`games/number-line-jumper/COMPARISON_APPENDIX.md`](games/number-line-jumper/COMPARISON_APPENDIX.md)
- Current package state:
  [`games/number-line-jumper/STATUS.md`](games/number-line-jumper/STATUS.md)
- Concise benchmark index:
  [`games/number-line-jumper/BENCHMARK_REVIEW.md`](games/number-line-jumper/BENCHMARK_REVIEW.md)
