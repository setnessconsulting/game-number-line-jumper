# Number Line Jumper — UX Design

## Experience principles

The number line is the primary visual object. Keep the interface sparse, value-anchored, predictable, and readable. The learner acts directly on represented mathematical values rather than on decorative physics or game-world abstractions.

## Setup

The learner chooses a band/mode unless the optional host supplies an initial band and auto-start policy. Host input never removes the standalone/manual fallback.

## Guided

1. Present the target and the active number line.
2. Learner places the marker by pointer/touch or keyboard.
3. Reveal the truth position only after submission.
4. Give direction/distance/strategy feedback.
5. Allow a non-punitive next attempt.

## Challenge

The same placement/reveal loop runs inside the bounded scored round. Scored zoom is intentionally absent. The summary reports session facts and aggregates without manipulative streak/urgency language.

## Explore

Explore is untimed and unscored. It supports pan, pinch, wheel, keyboard zoom, and deterministic “New number” prompts. GAME-231 fixed prompt seeding/repeat behavior. Explore zoom does not alter scored-round semantics.

## Reveal and feedback

- learner marker and truth flag are visually distinct without color-only meaning;
- feedback identifies direction and distance before strategy hints;
- midpoint/quarter anchors may support reasoning without turning the line into dense counting;
- motion must preserve meaning under reduced motion;
- the optional “Wait for me after feedback (this session)” setting keeps scored feedback visible until the learner activates a native Continue control;
- timed reveals retain the existing accuracy-based 900/1100/1400/1700 ms dwell, while Continue moves focus to the next target heading;
- GAME-230 owns continuous accuracy-correlated reveal motion and must provide a reduced-motion equivalent; the exact contract is in [`MOTION.md`](MOTION.md).

## Summary

Show bounded session results and next actions. Do not imply cross-device identity, persistent child records, or remote analytics.

## Input and assistive technology

- pointer/touch: direct placement on the line;
- keyboard: complete placement and zoom path where zoom is available;
- slider semantics expose the represented mathematical value, not pixel coordinates;
- announcements describe target/reveal/result in a stable order;
- focus should move only when it improves context and must not strand the learner.

## Responsive rules

Phone portrait is primary. At 360 px there must be no horizontal page overflow and the number-line interaction must remain usable. Phone landscape, tablet, and desktop reuse the same task structure rather than introducing different mathematical behavior.

## Motion and design authority

The owner selected these checked-in repository documents as the design authority for GAME-230 on 2026-09-19 because no Number Line Jumper Figma file exists. [`MOTION.md`](MOTION.md) records the error-to-intensity mapping, scale/glow bounds, easing, duration, far-tier settle, reduced-motion behavior, and non-color marker/truth distinction. This decision does not claim a Figma/design-alignment gate passed.

## Public arcade entry/exit

`games-site` owns the card, launcher, play route, selected production release, promotion, and rollback. The game build must work from a supplied versioned subpath. The current arcade route is intentionally non-playable until a validated candidate is promoted.
