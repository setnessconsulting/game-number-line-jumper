export type SessionClockMode = "free" | "break";
export type SessionClockPhase = "running" | "paused" | "expired";

export interface SessionClockSnapshot {
  mode: SessionClockMode;
  phase: SessionClockPhase;
  visibility: "visible" | "hidden";
  remainingMs: number;
}

export interface SessionClockScheduler {
  now(): number;
  schedule(callback: () => void, delayMs: number): unknown;
  cancel(handle: unknown): void;
}

export interface SessionClockOptions {
  mode: SessionClockMode;
  durationMs: number;
  initialRemainingMs?: number;
  tickMs?: number;
  scheduler: SessionClockScheduler;
  onChange?: (snapshot: SessionClockSnapshot) => void;
  onExpire?: () => void;
}

export interface SessionClock {
  start(): void;
  pause(): void;
  resume(): void;
  setHidden(hidden: boolean): void;
  snapshot(): SessionClockSnapshot;
  dispose(): void;
}

function clampRemaining(durationMs: number, remainingMs: number | undefined): number {
  const initial = remainingMs ?? durationMs;
  return Math.min(durationMs, Math.max(0, Number.isFinite(initial) ? initial : durationMs));
}

/**
 * Minimal shell-owned session clock. It contains no DOM, React, storage,
 * network, or host implementation dependency; all time and scheduling are
 * injected so fake clocks can prove the boundary behavior.
 */
export function createSessionClock({
  mode,
  durationMs,
  initialRemainingMs,
  tickMs = 1_000,
  scheduler,
  onChange,
  onExpire,
}: SessionClockOptions): SessionClock {
  const safeDurationMs = Math.max(0, Number.isFinite(durationMs) ? durationMs : 0);
  const safeTickMs = Math.max(1, Number.isFinite(tickMs) ? tickMs : 1_000);
  let remainingMs = clampRemaining(safeDurationMs, initialRemainingMs);
  let phase: SessionClockPhase = remainingMs <= 0 ? "expired" : "paused";
  let visibility: "visible" | "hidden" = "visible";
  let manualPaused = false;
  let runningSince: number | null = null;
  let handle: unknown = null;
  let disposed = false;
  let expirationNotified = false;

  function cancelScheduled(): void {
    if (handle === null) return;
    scheduler.cancel(handle);
    handle = null;
  }

  function syncRemaining(): void {
    if (phase !== "running" || runningSince === null) return;
    const now = scheduler.now();
    remainingMs = Math.max(0, remainingMs - Math.max(0, now - runningSince));
    runningSince = now;
  }

  function snapshot(): SessionClockSnapshot {
    syncRemaining();
    return { mode, phase, visibility, remainingMs };
  }

  function notify(): void {
    if (!disposed) onChange?.(snapshot());
  }

  function expire(): void {
    if (disposed || expirationNotified) return;
    syncRemaining();
    remainingMs = 0;
    phase = "expired";
    runningSince = null;
    cancelScheduled();
    expirationNotified = true;
    notify();
    onExpire?.();
  }

  function scheduleNext(): void {
    if (disposed || phase !== "running") return;
    const delay = Math.min(remainingMs, safeTickMs);
    handle = scheduler.schedule(() => {
      handle = null;
      if (disposed || phase !== "running") return;
      syncRemaining();
      if (remainingMs <= 0) expire();
      else {
        notify();
        scheduleNext();
      }
    }, delay);
  }

  function runIfAllowed(): void {
    if (disposed || phase === "expired") return;
    if (remainingMs <= 0) {
      expire();
      return;
    }
    if (manualPaused || (mode === "free" && visibility === "hidden")) {
      phase = "paused";
      runningSince = null;
      cancelScheduled();
      notify();
      return;
    }
    phase = "running";
    runningSince = scheduler.now();
    notify();
    scheduleNext();
  }

  return {
    start() {
      if (disposed || phase === "expired") return;
      manualPaused = false;
      runIfAllowed();
    },
    pause() {
      if (disposed || phase === "expired") return;
      syncRemaining();
      manualPaused = true;
      phase = "paused";
      runningSince = null;
      cancelScheduled();
      notify();
    },
    resume() {
      if (disposed || phase === "expired") return;
      manualPaused = false;
      runIfAllowed();
    },
    setHidden(hidden) {
      if (disposed || visibility === (hidden ? "hidden" : "visible")) return;
      visibility = hidden ? "hidden" : "visible";
      if (mode === "free" && hidden && phase === "running") {
        syncRemaining();
        phase = "paused";
        runningSince = null;
        cancelScheduled();
      } else if (mode === "free" && !hidden && phase === "paused" && !manualPaused) {
        runIfAllowed();
        return;
      }
      notify();
    },
    snapshot,
    dispose() {
      if (disposed) return;
      syncRemaining();
      disposed = true;
      cancelScheduled();
      runningSince = null;
    },
  };
}
