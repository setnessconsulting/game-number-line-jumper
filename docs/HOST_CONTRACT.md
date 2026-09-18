# Number Line Jumper host contract v1

The standalone game owns its gameplay state, number-line math, scoring, and emitted facts. Hosts own the surrounding lesson, session, placement, parent-brief, and outer-window lifecycle. The public contract is defined in `src/lib/numberLineJumper/hostContract.ts`; the pure placement adapter is separate from the math engine in `src/lib/numberLineJumper/placementAdapter.ts`.

## Launch and fallback rules

- Launch configuration is resolved once when the game mounts; remount with a new host object to start a new host session. Callback functions may be refreshed by the host while mounted.
- Omit the optional `host` prop for the existing standalone free-play experience.
- `version` must be `1`; an unsupported or malformed contract reports a fatal, JSON-safe error when an error callback is available, then falls back to free play.
- `initialBand` takes precedence over a complete placement level. Complete levels map as 1–2 → `g12`, 3–4 → `g34`, 5–6 → `g56`, and 7–8 → `g78`. The adapter does not change target generation or scoring.
- Invalid/missing placement, band, or `autoStart` inputs report recoverable errors and leave manual level selection available.
- `mode: "break"` requires a valid relative remaining-time budget or absolute epoch deadline and an `onReturnToPractice` callback. Without either, the game reports a recoverable error and falls back to free/manual play; it never silently creates an unbounded break or a break with no host return path.
- A bounded break emits `onReturnToPractice` at expiry. The game does not close a window, navigate, or unmount itself; the host decides how to return its outer experience. Unmount cleanup cancels the deadline timer.
- `sessionContext` permits only a coarse surface and launch reason. It intentionally has no learner, class, lesson, or session identifier fields.

## Callback behavior

All event payloads are plain JSON-safe data. Callback functions are only delivery channels; the game does not persist or transmit their payloads.

- `onExit` fires at most once for the game instance.
- `onReturnToPractice` fires at most once, for deadline expiry or a user exit from a bounded break.
- `onRoundComplete` fires at most once for each round number and includes the round summary plus an in-memory session aggregate snapshot.
- `onSessionAggregate` fires at most once, when the user exits or a bounded break completes. It is suitable as a future parent-brief input, not a network request.
- A host callback exception is contained and reported as a recoverable `HOST_CALLBACK_FAILED` event. Raw exceptions and input objects are not forwarded.

## Local integration example

```tsx
import { useMemo, useState } from "react";
import NumberLineJumper from "./src/app/games/NumberLineJumper";
import type { NumberLineJumperHostV1 } from "./src/lib/numberLineJumper/hostContract";

function LocalLessonHost() {
  const [showGame, setShowGame] = useState(true);
  const [lastRound, setLastRound] = useState<string | null>(null);
  const [parentBriefInput, setParentBriefInput] = useState<string | null>(null);
  const host = useMemo<NumberLineJumperHostV1>(() => ({
    version: 1,
    mode: "break",
    autoStart: true,
    placementResult: { status: "complete", level: 5 },
    timeLimit: { kind: "remaining", remainingMs: 60_000 },
    sessionContext: { surface: "lesson", launchReason: "earned-break" },
    callbacks: {
      onRoundComplete: (event) => setLastRound(`${event.summary.trials} scored trials`),
      onSessionAggregate: (event) => setParentBriefInput(JSON.stringify(event.aggregate)),
      onReturnToPractice: () => setShowGame(false),
    },
  }), []);

  return showGame
    ? <NumberLineJumper host={host} onExit={() => setShowGame(false)} />
    : <><p>Practice continues in the host.</p><p>{lastRound}</p><pre>{parentBriefInput}</pre></>;
}
```

Run the local parent harness at `/examples/host-harness.html` through `npm run test:e2e`; its short deadline and visible event log exercise auto-start, expiry, aggregate delivery, and host-owned unmounting. It uses no production credentials or private host interfaces. The E2E-only build mode includes this page; the normal release build excludes it.

## Ownership boundary

- `game-number-line-jumper`: gameplay state, pure math, scoring, and privacy-safe completion facts.
- LevelBest: lesson/session surfaces, placement decisions, parent-brief presentation, and host lifecycle.
- `games-site`: public arcade presentation and promotion.

The standalone game does not import LevelBest or `games-site`, and this contract adds no authentication, telemetry, remote transport, or persistent gameplay storage. Downstream stories such as GAME-225 and GAME-226 should consume this v1 seam rather than introduce parallel host interfaces.
