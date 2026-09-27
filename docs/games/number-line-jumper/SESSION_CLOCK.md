# Number Line Jumper session clock

GAME-235 owns the standalone round clock in the React shell. The mathematical
engine remains clock-free: target generation, placement, scoring, and reveal
math never read wall time or document visibility.

## Ownership and modes

- `src/lib/numberLineJumper/sessionClock.ts` is a small, framework-free clock
  abstraction. Time and scheduling are injected so unit tests can advance a
  fake clock without sleeps.
- The shell creates one clock for a mounted round and disposes it on exit,
  replay, level changes, completion, and unmount. It has no storage, cookies,
  network calls, telemetry, or host-runtime dependency.
- Free play has the existing 60-second round cap. When the document is hidden,
  the free clock pauses and resumes with the same remaining time when the
  learner returns.
- A scored reveal pauses the round clock until the timed reveal finishes or the
  learner presses Continue in wait-for-me mode. The ten-trial cap still ends a
  round before another target is generated.
- In host `break` mode the internal round clock continues while hidden. The
  host `deadlineEpochMs` scheduler is the outer authority for returning to
  practice; the game never pauses or extends that deadline. The break badge is
  display-only and uses cleanup-safe recursive timeouts.

## Boundary behavior

The clock uses absolute elapsed time between injected scheduler reads rather
than decrementing a counter. It schedules short refreshes for the visible
countdown, expires once at the exact boundary, and cancels its pending handle
on disposal. A visible-tab readback also checks the host deadline in case a
browser throttles a hidden-tab timeout.

Hidden/resumed states are announced through the live `clock-status` region. The
status describes whether free play paused or a host break continued; it does
not claim that the learner's round or host session was persisted.

## Evidence

- `tests/numberLineJumperSessionClock.test.ts` covers visible countdown,
  hidden free-play pause/resume, reveal pause, hidden host-break continuation,
  restored time, cleanup, and exact-once expiry with a fake scheduler.
- `tests/e2e/numberLineJumper.spec.ts` covers the browser visibility boundary
  for free play.
- `tests/e2e/numberLineJumperHost.spec.ts` covers the host deadline while the
  document is hidden and confirms a single return event.
- Accessibility, keyboard, touch, console, page-error, and host lifecycle
  suites remain part of `npm run test:ci`. Owner screen-reader validation is a
  separate GAME-224 release gate.
