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
});
