import { describe, expect, it, vi } from "vitest";
import { createSessionClock, type SessionClockScheduler } from "@/lib/numberLineJumper/sessionClock";

class FakeScheduler implements SessionClockScheduler {
  private currentTime = 0;
  private nextId = 1;
  private timers = new Map<number, { at: number; callback: () => void }>();

  now(): number {
    return this.currentTime;
  }

  schedule(callback: () => void, delayMs: number): number {
    const id = this.nextId++;
    this.timers.set(id, { at: this.currentTime + delayMs, callback });
    return id;
  }

  cancel(handle: unknown): void {
    this.timers.delete(handle as number);
  }

  advanceBy(durationMs: number): void {
    const target = this.currentTime + durationMs;
    while (true) {
      const next = [...this.timers.entries()]
        .filter(([, timer]) => timer.at <= target)
        .sort(([, first], [, second]) => first.at - second.at)[0];
      if (!next) break;
      const [id, timer] = next;
      this.timers.delete(id);
      this.currentTime = timer.at;
      timer.callback();
    }
    this.currentTime = target;
  }

  jumpTo(timeMs: number): void {
    this.currentTime = timeMs;
  }

  pendingCount(): number {
    return this.timers.size;
  }
}

describe("GAME-235 standalone session clock", () => {
  it("counts down while visible and expires at the exact boundary once", () => {
    const scheduler = new FakeScheduler();
    const changes: number[] = [];
    const onExpire = vi.fn();
    const clock = createSessionClock({
      mode: "free",
      durationMs: 10_000,
      scheduler,
      onChange: ({ remainingMs }) => changes.push(remainingMs),
      onExpire,
    });

    expect(clock.snapshot()).toMatchObject({ phase: "paused", remainingMs: 10_000 });
    clock.start();
    scheduler.advanceBy(2_500);
    expect(clock.snapshot()).toMatchObject({ phase: "running", remainingMs: 7_500 });
    scheduler.advanceBy(7_500);
    expect(clock.snapshot()).toMatchObject({ phase: "expired", remainingMs: 0 });
    expect(onExpire).toHaveBeenCalledOnce();
    expect(changes).toContain(0);
    clock.start();
    scheduler.advanceBy(1_000);
    expect(onExpire).toHaveBeenCalledOnce();
  });

  it("pauses free play while hidden and resumes only the remaining time", () => {
    const scheduler = new FakeScheduler();
    const onExpire = vi.fn();
    const clock = createSessionClock({ mode: "free", durationMs: 10_000, scheduler, onExpire });

    clock.start();
    scheduler.advanceBy(2_500);
    clock.setHidden(true);
    expect(clock.snapshot()).toMatchObject({ phase: "paused", visibility: "hidden", remainingMs: 7_500 });
    scheduler.advanceBy(20_000);
    expect(clock.snapshot().remainingMs).toBe(7_500);
    expect(onExpire).not.toHaveBeenCalled();
    clock.setHidden(false);
    expect(clock.snapshot().phase).toBe("running");
    scheduler.advanceBy(7_500);
    expect(onExpire).toHaveBeenCalledOnce();
  });

  it("keeps a manual reveal pause distinct from visibility pause", () => {
    const scheduler = new FakeScheduler();
    const clock = createSessionClock({ mode: "free", durationMs: 10_000, scheduler });

    clock.start();
    scheduler.advanceBy(1_000);
    clock.pause();
    scheduler.advanceBy(4_000);
    expect(clock.snapshot()).toMatchObject({ phase: "paused", remainingMs: 9_000 });
    clock.setHidden(true);
    clock.resume();
    expect(clock.snapshot().phase).toBe("paused");
    clock.setHidden(false);
    expect(clock.snapshot().phase).toBe("running");
    scheduler.advanceBy(9_000);
    expect(clock.snapshot().phase).toBe("expired");
  });

  it("keeps the host break countdown running while hidden", () => {
    const scheduler = new FakeScheduler();
    const onExpire = vi.fn();
    const clock = createSessionClock({ mode: "break", durationMs: 5_000, scheduler, onExpire });

    clock.start();
    clock.setHidden(true);
    scheduler.advanceBy(5_000);
    expect(clock.snapshot()).toMatchObject({ phase: "expired", visibility: "hidden", remainingMs: 0 });
    expect(onExpire).toHaveBeenCalledOnce();
  });

  it("supports a restored remaining time and cancels all scheduled work on dispose", () => {
    const scheduler = new FakeScheduler();
    const onExpire = vi.fn();
    const clock = createSessionClock({
      mode: "free",
      durationMs: 60_000,
      initialRemainingMs: 4_000,
      scheduler,
      onExpire,
    });

    clock.start();
    expect(scheduler.pendingCount()).toBe(1);
    clock.dispose();
    expect(scheduler.pendingCount()).toBe(0);
    scheduler.advanceBy(10_000);
    expect(onExpire).not.toHaveBeenCalled();
    clock.start();
    clock.pause();
    clock.resume();
    clock.setHidden(true);
    clock.dispose();
  });

  it("expires immediately for an empty or invalid duration", () => {
    const scheduler = new FakeScheduler();
    const emptyExpire = vi.fn();
    const empty = createSessionClock({ mode: "free", durationMs: 0, scheduler, onExpire: emptyExpire });
    empty.start();
    expect(empty.snapshot()).toMatchObject({ phase: "expired", remainingMs: 0 });
    expect(emptyExpire).not.toHaveBeenCalled();

    const invalidExpire = vi.fn();
    const invalid = createSessionClock({
      mode: "break",
      durationMs: 5_000,
      initialRemainingMs: Number.NaN,
      tickMs: Number.NaN,
      scheduler,
      onExpire: invalidExpire,
    });
    invalid.start();
    expect(invalid.snapshot()).toMatchObject({ phase: "running", remainingMs: 5_000 });
    invalid.dispose();

    const invalidDuration = createSessionClock({ mode: "break", durationMs: Number.NaN, scheduler, onExpire: invalidExpire });
    expect(invalidDuration.snapshot().phase).toBe("expired");
    expect(invalidExpire).not.toHaveBeenCalled();
  });

  it("expires when a paused clock reaches zero before it is resumed", () => {
    const scheduler = new FakeScheduler();
    const onExpire = vi.fn();
    const clock = createSessionClock({ mode: "free", durationMs: 5_000, scheduler, onExpire });

    clock.start();
    scheduler.jumpTo(5_000);
    clock.pause();
    expect(clock.snapshot()).toMatchObject({ phase: "paused", remainingMs: 0 });
    clock.resume();
    expect(clock.snapshot().phase).toBe("expired");
    expect(onExpire).toHaveBeenCalledOnce();
  });
});
