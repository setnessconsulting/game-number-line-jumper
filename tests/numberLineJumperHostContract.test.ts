import { describe, expect, it, vi } from "vitest";
import { sessionAggregates } from "@/lib/numberLineJumper/aggregates";
import { summarizeRound } from "@/lib/numberLineJumper/engine";
import {
  createHostEventSinkV1,
  HOST_CONTRACT_VERSION,
  resolveHostContractV1,
  scheduleDeadlineV1,
  type HostRoundCompleteEventV1,
} from "@/lib/numberLineJumper/hostContract";
import { mapPlacementResultToBand } from "@/lib/numberLineJumper/placementAdapter";

describe("GAME-292 versioned host contract", () => {
  it("preserves manual free play when no host contract is supplied", () => {
    expect(resolveHostContractV1()).toMatchObject({
      mode: "free",
      autoStart: false,
      initialBand: null,
      deadlineEpochMs: null,
      sessionContext: null,
      errors: [],
    });
  });

  it("maps only complete, in-range placement levels through a pure adapter", () => {
    expect(mapPlacementResultToBand({ status: "complete", level: 1 })).toBe("g12");
    expect(mapPlacementResultToBand({ status: "complete", level: 3 })).toBe("g34");
    expect(mapPlacementResultToBand({ status: "complete", level: 5 })).toBe("g56");
    expect(mapPlacementResultToBand({ status: "complete", level: 8 })).toBe("g78");
    expect(mapPlacementResultToBand({ status: "incomplete", level: 8 })).toBeNull();
    expect(mapPlacementResultToBand({ status: "complete", level: 9 })).toBeNull();
    expect(mapPlacementResultToBand({ status: "complete", level: Number.NaN })).toBeNull();
    expect(mapPlacementResultToBand(null)).toBeNull();
    expect(mapPlacementResultToBand([])).toBeNull();
    expect(mapPlacementResultToBand("complete")).toBeNull();
    expect(mapPlacementResultToBand({ status: "complete", level: 1.5 })).toBeNull();
    expect(mapPlacementResultToBand({ status: "complete", level: 0 })).toBeNull();
    expect(mapPlacementResultToBand({ status: "complete", level: "3" })).toBeNull();
  });

  it("maps every canonical grade-third-v1 band through golden fixtures", () => {
    const fixtures = [
      [1, "early", "g12"], [2, "mid", "g12"],
      [3, "late", "g34"], [4, "early", "g34"],
      [5, "mid", "g56"], [6, "late", "g56"],
      [7, "early", "g78"], [8, "mid", "g78"],
    ] as const;

    for (const [grade, third, expected] of fixtures) {
      expect(mapPlacementResultToBand({
        kind: "band",
        band: { grade, third },
        levelParam: `${grade}-${third}`,
      })).toBe(expected);
    }
  });

  it("fails closed for edge, malformed, and inconsistent grade-third results", () => {
    expect(mapPlacementResultToBand({ kind: "below", band: null, levelParam: null })).toBeNull();
    expect(mapPlacementResultToBand({ kind: "above", band: null, levelParam: null })).toBeNull();
    expect(mapPlacementResultToBand({
      kind: "band",
      band: { grade: 5, third: "mid" },
      levelParam: "5-late",
    })).toBeNull();
    expect(mapPlacementResultToBand({
      kind: "band",
      band: { grade: 9, third: "mid" },
      levelParam: "9-mid",
    })).toBeNull();
    expect(mapPlacementResultToBand({
      kind: "band",
      band: { grade: 5, third: "mid" },
      levelParam: null,
    })).toBeNull();
    expect(mapPlacementResultToBand({ kind: "band", band: null, levelParam: null })).toBeNull();
  });

  it("keeps explicit host choices authoritative and reports malformed optional values", () => {
    const resolved = resolveHostContractV1({
      version: HOST_CONTRACT_VERSION,
      mode: "free",
      initialBand: "g78",
      placementResult: { status: "complete", level: 1 },
      autoStart: "yes",
      sessionContext: { surface: "lesson" },
      callbacks: { onExit: "not a callback" },
    });

    expect(resolved).toMatchObject({ initialBand: "g78", autoStart: false, sessionContext: { surface: "lesson" } });
    expect(resolved.errors.map(({ code }) => code)).toEqual([
      "INVALID_HOST_CALLBACKS",
      "INVALID_AUTO_START",
    ]);

    const invalid = resolveHostContractV1({
      version: HOST_CONTRACT_VERSION,
      mode: "free",
      initialBand: "g99",
      sessionContext: { surface: "parent", launchReason: "other" },
      callbacks: null,
    });
    expect(invalid.errors.map(({ code }) => code)).toEqual([
      "INVALID_HOST_CALLBACKS",
      "INVALID_INITIAL_BAND",
      "INVALID_SESSION_CONTEXT",
    ]);
  });

  it("fails safely for non-object contracts, arrays, and invalid modes", () => {
    for (const input of [null, "host", 3, []]) {
      expect(resolveHostContractV1(input).errors[0]?.code).toBe("INVALID_HOST_CONTRACT");
    }
    expect(resolveHostContractV1({ version: HOST_CONTRACT_VERSION, mode: "challenge" }).errors[0]?.code)
      .toBe("INVALID_MODE");
  });

  it("omits invalid time limits and downgrades an unbounded break to free play", () => {
    const invalidTimeLimits: unknown[] = [
      null,
      { kind: "remaining", remainingMs: "500" },
      { kind: "remaining", remainingMs: -1 },
      { kind: "deadline", deadlineEpochMs: Number.POSITIVE_INFINITY },
      { kind: "unknown", value: 10 },
    ];

    for (const timeLimit of invalidTimeLimits) {
      const result = resolveHostContractV1({
        version: HOST_CONTRACT_VERSION,
        mode: "break",
        timeLimit,
        callbacks: { onReturnToPractice: () => undefined },
      });
      expect(result.mode).toBe("free");
      expect(result.errors.map(({ code }) => code)).toEqual([
        "INVALID_TIME_LIMIT",
        "BREAK_TIME_LIMIT_REQUIRED",
      ]);
    }
  });

  it("auto-starts from a valid placement and falls back to manual selection for invalid placement", () => {
    const valid = resolveHostContractV1({
      version: HOST_CONTRACT_VERSION,
      mode: "free",
      autoStart: true,
      placementResult: { status: "complete", level: 6 },
    }, 1_000);
    expect(valid).toMatchObject({ mode: "free", autoStart: true, initialBand: "g56" });

    const invalid = resolveHostContractV1({
      version: HOST_CONTRACT_VERSION,
      mode: "free",
      autoStart: true,
      placementResult: { status: "complete", level: 99 },
    }, 1_000);
    expect(invalid).toMatchObject({ mode: "free", autoStart: false, initialBand: null });
    expect(invalid.errors.map(({ code }) => code)).toContain("INVALID_PLACEMENT_RESULT");
    expect(invalid.errors.map(({ code }) => code)).toContain("AUTO_START_REQUIRES_BAND");

    const canonical = resolveHostContractV1({
      version: HOST_CONTRACT_VERSION,
      mode: "free",
      autoStart: true,
      placementResult: {
        kind: "band",
        band: { grade: 7, third: "late" },
        levelParam: "7-late",
      },
    });
    expect(canonical).toMatchObject({ mode: "free", autoStart: true, initialBand: "g78" });
  });

  it("requires a valid deadline for bounded-break mode and resolves both deadline forms", () => {
    const missing = resolveHostContractV1({
      version: HOST_CONTRACT_VERSION,
      mode: "break",
      autoStart: true,
      initialBand: "g12",
    }, 10_000);
    expect(missing).toMatchObject({ mode: "free", autoStart: false, deadlineEpochMs: null });
    expect(missing.errors.map(({ code }) => code)).toContain("BREAK_TIME_LIMIT_REQUIRED");

    const missingReturn = resolveHostContractV1({
      version: HOST_CONTRACT_VERSION,
      mode: "break",
      autoStart: true,
      initialBand: "g12",
      timeLimit: { kind: "remaining", remainingMs: 1_500 },
    }, 10_000);
    expect(missingReturn).toMatchObject({ mode: "free", autoStart: false, deadlineEpochMs: null });
    expect(missingReturn.errors.map(({ code }) => code)).toContain("BREAK_RETURN_CALLBACK_REQUIRED");

    const remaining = resolveHostContractV1({
      version: HOST_CONTRACT_VERSION,
      mode: "break",
      autoStart: true,
      initialBand: "g34",
      timeLimit: { kind: "remaining", remainingMs: 1_500 },
      sessionContext: { surface: "practice", launchReason: "earned-break" },
      callbacks: { onReturnToPractice: () => undefined },
    }, 10_000);
    expect(remaining).toMatchObject({ mode: "break", autoStart: true, deadlineEpochMs: 11_500 });
    expect(JSON.stringify(remaining.sessionContext)).toBe(JSON.stringify({ surface: "practice", launchReason: "earned-break" }));

    const absolute = resolveHostContractV1({
      version: HOST_CONTRACT_VERSION,
      mode: "break",
      timeLimit: { kind: "deadline", deadlineEpochMs: 20_000 },
      callbacks: { onReturnToPractice: () => undefined },
    }, 10_000);
    expect(absolute.deadlineEpochMs).toBe(20_000);
  });

  it("fails safely on schema mismatch and reports a fatal, JSON-safe error", () => {
    const onError = vi.fn();
    const host = resolveHostContractV1({
      version: 2,
      mode: "break",
      callbacks: { onError },
    }, 0);
    expect(host).toMatchObject({ mode: "free", autoStart: false, initialBand: null });
    expect(host.errors[0]).toMatchObject({ severity: "fatal", code: "UNSUPPORTED_VERSION" });

    const sink = createHostEventSinkV1(host.callbacks);
    sink.reportError(host.errors[0]!);
    expect(onError).toHaveBeenCalledTimes(1);
    expect(JSON.parse(JSON.stringify(host.errors[0]))).toEqual(host.errors[0]);
  });

  it("emits each round and session aggregate at most once and contains callback failures", () => {
    const roundComplete = vi.fn();
    const sessionAggregate = vi.fn();
    const exit = vi.fn();
    const returnToPractice = vi.fn();
    const error = vi.fn();
    const sink = createHostEventSinkV1({
      onExit: exit,
      onReturnToPractice: returnToPractice,
      onRoundComplete: roundComplete,
      onSessionAggregate: sessionAggregate,
      onError: error,
    });
    const event: HostRoundCompleteEventV1 = {
      version: HOST_CONTRACT_VERSION,
      roundNumber: 1,
      band: "g12",
      mode: "guided",
      summary: summarizeRound([]),
      sessionAggregate: sessionAggregates({ trials: [] }),
      context: { surface: "lesson" },
    };
    const aggregateEvent = {
      version: HOST_CONTRACT_VERSION,
      reason: "exit" as const,
      aggregate: sessionAggregates({ trials: [] }),
      context: { surface: "lesson" } as const,
    };

    sink.emitRoundComplete(event);
    sink.emitRoundComplete(event);
    sink.emitSessionAggregate(aggregateEvent);
    sink.emitSessionAggregate(aggregateEvent);
    const exitEvent = { version: HOST_CONTRACT_VERSION, reason: "user-exit" as const, mode: "free" as const, context: null };
    const returnEvent = { version: HOST_CONTRACT_VERSION, reason: "deadline" as const, context: null };
    sink.emitExit(exitEvent);
    sink.emitExit(exitEvent);
    sink.emitReturnToPractice(returnEvent);
    sink.emitReturnToPractice(returnEvent);
    expect(roundComplete).toHaveBeenCalledTimes(1);
    expect(sessionAggregate).toHaveBeenCalledTimes(1);
    expect(exit).toHaveBeenCalledTimes(1);
    expect(returnToPractice).toHaveBeenCalledTimes(1);
    expect(JSON.parse(JSON.stringify(event))).toEqual(event);

    const throwingSink = createHostEventSinkV1({
      onExit: () => { throw new Error("must not cross the host boundary"); },
      onError: error,
    });
    throwingSink.emitExit({ version: HOST_CONTRACT_VERSION, reason: "user-exit", mode: "free", context: null });
    expect(error).toHaveBeenCalledWith(expect.objectContaining({
      severity: "recoverable",
      code: "HOST_CALLBACK_FAILED",
      source: "onExit",
    }));
  });

  it("does not call host callbacks after teardown", () => {
    const onReturn = vi.fn();
    const sink = createHostEventSinkV1({ onReturnToPractice: onReturn });
    sink.dispose();
    sink.emitReturnToPractice({ version: HOST_CONTRACT_VERSION, reason: "deadline", context: null });
    expect(onReturn).not.toHaveBeenCalled();
  });

  it("deduplicates errors, contains a throwing error handler, and supports explicit reactivation", () => {
    const onError = vi.fn(() => { throw new Error("error handler is also untrusted"); });
    const sink = createHostEventSinkV1({ onError });
    const error = {
      version: HOST_CONTRACT_VERSION,
      severity: "recoverable" as const,
      code: "INVALID_TIME_LIMIT" as const,
      message: "The bounded time limit is invalid.",
    };

    expect(() => sink.reportError(error)).not.toThrow();
    sink.reportError({ ...error, message: "same error identity" });
    expect(onError).toHaveBeenCalledTimes(1);
    sink.dispose();
    sink.reportError({ ...error, code: "INVALID_MODE" });
    expect(onError).toHaveBeenCalledTimes(1);
    sink.activate();
    expect(() => sink.reportError({ ...error, code: "INVALID_MODE" })).not.toThrow();
    expect(onError).toHaveBeenCalledTimes(2);
  });

  it("expires at the deadline once and cancels cleanly on unmount", () => {
    let now = 1_000;
    let scheduled: (() => void) | undefined;
    let scheduledDelay = 0;
    let cancelled = false;
    const onExpire = vi.fn();
    const cleanup = scheduleDeadlineV1(2_500, {
      now: () => now,
      schedule(callback, delayMs) {
        scheduled = callback;
        scheduledDelay = delayMs;
        return 1;
      },
      cancel() { cancelled = true; },
    }, onExpire);

    expect(scheduledDelay).toBe(1_500);
    now = 2_500;
    scheduled?.();
    scheduled?.();
    expect(onExpire).toHaveBeenCalledTimes(1);

    now = 1_000;
    const afterUnmount = vi.fn();
    const cancelDeadline = scheduleDeadlineV1(3_000, {
      now: () => now,
      schedule(callback) {
        scheduled = callback;
        return 2;
      },
      cancel() { cancelled = true; },
    }, afterUnmount);
    cancelDeadline();
    now = 3_000;
    scheduled?.();
    expect(cancelled).toBe(true);
    expect(afterUnmount).not.toHaveBeenCalled();
    cleanup();
  });

  it("expires immediately for a past deadline and caps long scheduler intervals", () => {
    const immediate = vi.fn();
    const cancel = vi.fn();
    const schedule = vi.fn(() => 1);
    const cleanupImmediate = scheduleDeadlineV1(10, {
      now: () => 10,
      schedule,
      cancel,
    }, immediate);
    expect(immediate).toHaveBeenCalledOnce();
    expect(schedule).not.toHaveBeenCalled();
    cleanupImmediate();
    expect(cancel).not.toHaveBeenCalled();

    let now = 0;
    let nextTick: (() => void) | undefined;
    const delays: number[] = [];
    const cleanupLong = scheduleDeadlineV1(2_147_483_648 + 10_000, {
      now: () => now,
      schedule(callback, delayMs) {
        nextTick = callback;
        delays.push(delayMs);
        return delays.length;
      },
      cancel: vi.fn(),
    }, vi.fn());
    expect(delays[0]).toBe(2_147_483_647);
    now = 2_147_483_648;
    nextTick?.();
    expect(delays[1]).toBe(10_000);
    cleanupLong();
  });
});
