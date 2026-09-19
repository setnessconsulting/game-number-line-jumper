# Number Line Jumper — Reveal Motion Contract

Status: repository-authorized GAME-230 authority, selected by the owner on 2026-09-19. A Figma file is not required for this wave.

## Error-to-intensity mapping

`PlacementScore.error` is relative absolute error: `|player − target| / rangeLength`. The UI derives an accuracy-correlated intensity without changing scoring:

```text
intensity = clamp(1 - error / 0.5, 0, 1)
```

An exact placement has intensity `1`. A 25% relative error has intensity `0.5`. Errors at or above 50% settle at intensity `0`. The value is emitted as the internal CSS custom property `--nl-reveal-intensity` on both the learner-marker and truth-positioner reveal elements.

## Motion tokens

| Token | Contract |
| --- | --- |
| Scale | Continuous `1.00`–`1.18`, increasing with accuracy intensity |
| Glow blur | Continuous `12px`–`20px`, increasing with accuracy intensity |
| Easing | `cubic-bezier(0.2, 0.8, 0.2, 1)` |
| Reveal duration | `360ms` at zero intensity through `280ms` at full intensity |
| Far-tier settle | `420ms`, gentle `1.02` settle with no celebratory overshoot |
| Feedback dwell | Existing scored delays remain 900/1100/1400/1700ms; motion does not change the dwell contract |

The exact/close/far buckets continue to supply the textual coaching and non-color visual palette. They do not replace the continuous intensity signal.

## Reduced motion and truth distinction

When `prefers-reduced-motion: reduce` is active, reveal animations and marker scale motion are removed. The feedback text, numeric estimate, numeric target, and score remain available. The learner marker remains a distinct jumper token labelled “Your estimate”; the truth remains a two-pixel line with a “Target” flag. Color is never the only distinction.

## Intentional deviations

This contract replaces the earlier provisional Figma prerequisite for GAME-221. No Figma fileKey, Figma version, or page reference is claimed. Any future design-system change must update this note and its tests in the same bounded PR.
