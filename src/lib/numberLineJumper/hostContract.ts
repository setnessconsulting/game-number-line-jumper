import type { SessionAggregates } from "./aggregates";
import { isPlacementBand, mapPlacementResultToBand } from "./placementAdapter";
import type { PlacementResultInputV1 } from "./placementAdapter";
import type { PlacementBand, RoundMode, RoundSummary } from "./types";

export const HOST_CONTRACT_VERSION = 1 as const;

export type HostModeV1 = "free" | "break";

/** Coarse launch context only; deliberately contains no user or lesson IDs. */
export interface HostSessionContextV1 {
  surface: "lesson" | "practice" | "arcade";
  launchReason?: "standalone" | "placement" | "earned-break" | "direct";
}

/** A relative budget is captured at mount; an absolute deadline is host-clock time. */
export type HostTimeLimitV1 =
  | { kind: "remaining"; remainingMs: number }
  | { kind: "deadline"; deadlineEpochMs: number };

export type HostIntegrationErrorCodeV1 =
  | "INVALID_HOST_CONTRACT"
  | "UNSUPPORTED_VERSION"
  | "INVALID_MODE"
  | "INVALID_AUTO_START"
  | "INVALID_INITIAL_BAND"
  | "INVALID_PLACEMENT_RESULT"
  | "INVALID_TIME_LIMIT"
  | "BREAK_TIME_LIMIT_REQUIRED"
  | "BREAK_RETURN_CALLBACK_REQUIRED"
  | "INVALID_SESSION_CONTEXT"
  | "AUTO_START_REQUIRES_BAND"
  | "INVALID_HOST_CALLBACKS"
  | "HOST_CALLBACK_FAILED";

export type HostCallbackNameV1 =
  | "onExit"
  | "onReturnToPractice"
  | "onRoundComplete"
  | "onSessionAggregate"
  | "onError";

/** JSON-safe integration error; raw exceptions and host input are never forwarded. */
export interface HostIntegrationErrorV1 {
  version: typeof HOST_CONTRACT_VERSION;
  severity: "recoverable" | "fatal";
  code: HostIntegrationErrorCodeV1;
  message: string;
  source?: HostCallbackNameV1;
}

export interface HostExitEventV1 {
  version: typeof HOST_CONTRACT_VERSION;
  reason: "user-exit";
  mode: HostModeV1;
  context: HostSessionContextV1 | null;
}

export interface HostReturnToPracticeEventV1 {
  version: typeof HOST_CONTRACT_VERSION;
  reason: "deadline" | "user-exit";
  context: HostSessionContextV1 | null;
}

export interface HostRoundCompleteEventV1 {
  version: typeof HOST_CONTRACT_VERSION;
  roundNumber: number;
  band: PlacementBand;
  mode: RoundMode;
  summary: RoundSummary;
  sessionAggregate: SessionAggregates;
  context: HostSessionContextV1 | null;
}

export interface HostSessionAggregateEventV1 {
  version: typeof HOST_CONTRACT_VERSION;
  reason: "exit" | "break-complete";
  aggregate: SessionAggregates;
  context: HostSessionContextV1 | null;
}

/** Callback functions are channels; every event payload passed through them is JSON-safe. */
export interface NumberLineJumperHostCallbacksV1 {
  onExit?: (event: HostExitEventV1) => void;
  onReturnToPractice?: (event: HostReturnToPracticeEventV1) => void;
  onRoundComplete?: (event: HostRoundCompleteEventV1) => void;
  onSessionAggregate?: (event: HostSessionAggregateEventV1) => void;
  /** Kept stable so an older host can safely receive an unsupported-version error. */
  onError?: (event: HostIntegrationErrorV1) => void;
}

/** Public host prop. It is optional; omitting it preserves standalone free play. */
export interface NumberLineJumperHostV1 {
  version: typeof HOST_CONTRACT_VERSION;
  mode: HostModeV1;
  autoStart?: boolean;
  initialBand?: PlacementBand;
  placementResult?: PlacementResultInputV1;
  timeLimit?: HostTimeLimitV1;
  sessionContext?: HostSessionContextV1;
  callbacks?: NumberLineJumperHostCallbacksV1;
}

export interface ResolvedHostContractV1 {
  mode: HostModeV1;
  autoStart: boolean;
  initialBand: PlacementBand | null;
  deadlineEpochMs: number | null;
  sessionContext: HostSessionContextV1 | null;
  callbacks: NumberLineJumperHostCallbacksV1;
  errors: HostIntegrationErrorV1[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function integrationError(
  code: HostIntegrationErrorCodeV1,
  severity: HostIntegrationErrorV1["severity"],
  message: string,
): HostIntegrationErrorV1 {
  return { version: HOST_CONTRACT_VERSION, severity, code, message };
}

function readCallbacks(value: unknown): NumberLineJumperHostCallbacksV1 {
  if (!isRecord(value)) return {};
  const callbacks: NumberLineJumperHostCallbacksV1 = {};
  if (typeof value.onExit === "function") callbacks.onExit = value.onExit as NumberLineJumperHostCallbacksV1["onExit"];
  if (typeof value.onReturnToPractice === "function") callbacks.onReturnToPractice = value.onReturnToPractice as NumberLineJumperHostCallbacksV1["onReturnToPractice"];
  if (typeof value.onRoundComplete === "function") callbacks.onRoundComplete = value.onRoundComplete as NumberLineJumperHostCallbacksV1["onRoundComplete"];
  if (typeof value.onSessionAggregate === "function") callbacks.onSessionAggregate = value.onSessionAggregate as NumberLineJumperHostCallbacksV1["onSessionAggregate"];
  if (typeof value.onError === "function") callbacks.onError = value.onError as NumberLineJumperHostCallbacksV1["onError"];
  return callbacks;
}

function readSessionContext(value: unknown): HostSessionContextV1 | null {
  if (!isRecord(value)) return null;
  if (value.surface !== "lesson" && value.surface !== "practice" && value.surface !== "arcade") return null;
  const launchReason = value.launchReason;
  if (
    launchReason !== undefined &&
    launchReason !== "standalone" &&
    launchReason !== "placement" &&
    launchReason !== "earned-break" &&
    launchReason !== "direct"
  ) return null;
  return launchReason === undefined
    ? { surface: value.surface }
    : { surface: value.surface, launchReason };
}

function resolveDeadline(value: unknown, nowMs: number): number | null {
  if (!isRecord(value)) return null;
  if (value.kind === "remaining") {
    if (typeof value.remainingMs !== "number" || !Number.isFinite(value.remainingMs) || value.remainingMs < 0) return null;
    return nowMs + value.remainingMs;
  }
  if (value.kind === "deadline") {
    if (typeof value.deadlineEpochMs !== "number" || !Number.isFinite(value.deadlineEpochMs)) return null;
    return value.deadlineEpochMs;
  }
  return null;
}

/** Validate an unknown runtime boundary and fail safely to free/manual play. */
export function resolveHostContractV1(input?: unknown, nowMs = Date.now()): ResolvedHostContractV1 {
  const errors: HostIntegrationErrorV1[] = [];
  if (input === undefined) {
    return {
      mode: "free",
      autoStart: false,
      initialBand: null,
      deadlineEpochMs: null,
      sessionContext: null,
      callbacks: {},
      errors,
    };
  }

  if (!isRecord(input)) {
    return {
      mode: "free",
      autoStart: false,
      initialBand: null,
      deadlineEpochMs: null,
      sessionContext: null,
      callbacks: {},
      errors: [integrationError("INVALID_HOST_CONTRACT", "fatal", "Host configuration was not an object; using free standalone play.")],
    };
  }

  const callbacks = readCallbacks(input.callbacks);
  const fallback = (error: HostIntegrationErrorV1): ResolvedHostContractV1 => ({
    mode: "free",
    autoStart: false,
    initialBand: null,
    deadlineEpochMs: null,
    sessionContext: null,
    callbacks,
    errors: [error],
  });

  if (input.version !== HOST_CONTRACT_VERSION) {
    return fallback(integrationError("UNSUPPORTED_VERSION", "fatal", "Host contract version is unsupported; using free standalone play."));
  }

  if (input.mode !== "free" && input.mode !== "break") {
    return fallback(integrationError("INVALID_MODE", "fatal", "Host mode is invalid; using free standalone play."));
  }

  const rawCallbacks = input.callbacks;
  if (rawCallbacks !== undefined && !isRecord(rawCallbacks)) {
    errors.push(integrationError("INVALID_HOST_CALLBACKS", "recoverable", "Host callbacks were invalid and have been ignored."));
  } else if (isRecord(rawCallbacks)) {
    const callbackNames: HostCallbackNameV1[] = ["onExit", "onReturnToPractice", "onRoundComplete", "onSessionAggregate", "onError"];
    if (callbackNames.some((name) => rawCallbacks[name] !== undefined && typeof rawCallbacks[name] !== "function")) {
      errors.push(integrationError("INVALID_HOST_CALLBACKS", "recoverable", "One or more host callbacks were invalid and have been ignored."));
    }
  }

  let initialBand: PlacementBand | null = null;
  if (input.initialBand !== undefined) {
    if (isPlacementBand(input.initialBand)) initialBand = input.initialBand;
    else errors.push(integrationError("INVALID_INITIAL_BAND", "recoverable", "Initial level was invalid; choose a level manually."));
  }

  if (input.placementResult !== undefined) {
    const mappedBand = mapPlacementResultToBand(input.placementResult);
    if (mappedBand) initialBand ??= mappedBand;
    else errors.push(integrationError("INVALID_PLACEMENT_RESULT", "recoverable", "Placement could not be used; choose a level manually."));
  }

  let sessionContext: HostSessionContextV1 | null = null;
  if (input.sessionContext !== undefined) {
    sessionContext = readSessionContext(input.sessionContext);
    if (!sessionContext) errors.push(integrationError("INVALID_SESSION_CONTEXT", "recoverable", "Session context was invalid and has been omitted."));
  }

  let mode: HostModeV1 = input.mode;
  let deadlineEpochMs: number | null = null;
  if (input.timeLimit !== undefined) {
    deadlineEpochMs = resolveDeadline(input.timeLimit, nowMs);
    if (deadlineEpochMs === null) errors.push(integrationError("INVALID_TIME_LIMIT", "recoverable", "Host time limit was invalid and has been ignored."));
  }
  if (mode === "break" && deadlineEpochMs === null) {
    errors.push(integrationError("BREAK_TIME_LIMIT_REQUIRED", "recoverable", "A bounded break needs a valid time limit; using free play."));
    mode = "free";
  }
  if (mode === "break" && !callbacks.onReturnToPractice) {
    errors.push(integrationError("BREAK_RETURN_CALLBACK_REQUIRED", "recoverable", "A bounded break needs a host return callback; using free play."));
    mode = "free";
  }

  let autoStart = false;
  if (input.autoStart !== undefined) {
    if (typeof input.autoStart === "boolean") autoStart = input.autoStart;
    else errors.push(integrationError("INVALID_AUTO_START", "recoverable", "Auto-start was invalid; manual level selection is enabled."));
  }
  if (autoStart && !initialBand) {
    autoStart = false;
    errors.push(integrationError("AUTO_START_REQUIRES_BAND", "recoverable", "Auto-start needs a valid level; choose a level manually."));
  }
  if (input.mode === "break" && mode === "free") autoStart = false;

  return { mode, autoStart, initialBand, deadlineEpochMs: mode === "break" ? deadlineEpochMs : null, sessionContext, callbacks, errors };
}

export interface HostEventSinkV1 {
  activate(): void;
  dispose(): void;
  reportError(error: HostIntegrationErrorV1): void;
  emitExit(event: HostExitEventV1): void;
  emitReturnToPractice(event: HostReturnToPracticeEventV1): void;
  emitRoundComplete(event: HostRoundCompleteEventV1): void;
  emitSessionAggregate(event: HostSessionAggregateEventV1): void;
}

/** Idempotent, exception-safe callback adapter with no storage or transport. */
export function createHostEventSinkV1(callbacks: NumberLineJumperHostCallbacksV1 = {}): HostEventSinkV1 {
  let active = true;
  let exitEmitted = false;
  let returnEmitted = false;
  let sessionAggregateEmitted = false;
  const completedRounds = new Set<number>();
  const reportedErrors = new Set<string>();

  const reportError = (error: HostIntegrationErrorV1) => {
    if (!active) return;
    const key = `${error.severity}:${error.code}:${error.source ?? ""}`;
    if (reportedErrors.has(key)) return;
    reportedErrors.add(key);
    try {
      callbacks.onError?.(error);
    } catch {
      // Error reporting is the last boundary; a host error handler cannot break gameplay.
    }
  };

  const invoke = <T>(
    source: HostCallbackNameV1,
    callback: ((event: T) => void) | undefined,
    event: T,
  ) => {
    if (!active || !callback) return;
    try {
      callback(event);
    } catch {
      reportError({
        version: HOST_CONTRACT_VERSION,
        severity: "recoverable",
        code: "HOST_CALLBACK_FAILED",
        message: "A host callback failed; gameplay remains available.",
        source,
      });
    }
  };

  return {
    activate() { active = true; },
    dispose() { active = false; },
    reportError,
    emitExit(event) {
      if (exitEmitted) return;
      exitEmitted = true;
      invoke("onExit", callbacks.onExit, event);
    },
    emitReturnToPractice(event) {
      if (returnEmitted) return;
      returnEmitted = true;
      invoke("onReturnToPractice", callbacks.onReturnToPractice, event);
    },
    emitRoundComplete(event) {
      if (completedRounds.has(event.roundNumber)) return;
      completedRounds.add(event.roundNumber);
      invoke("onRoundComplete", callbacks.onRoundComplete, event);
    },
    emitSessionAggregate(event) {
      if (sessionAggregateEmitted) return;
      sessionAggregateEmitted = true;
      invoke("onSessionAggregate", callbacks.onSessionAggregate, event);
    },
  };
}

export interface DeadlineSchedulerV1 {
  now(): number;
  schedule(callback: () => void, delayMs: number): unknown;
  cancel(handle: unknown): void;
}

/** Schedule against an absolute deadline and return cleanup safe for unmount. */
export function scheduleDeadlineV1(
  deadlineEpochMs: number,
  scheduler: DeadlineSchedulerV1,
  onExpire: () => void,
): () => void {
  let active = true;
  let handle: unknown;
  const tick = () => {
    if (!active) return;
    const remainingMs = deadlineEpochMs - scheduler.now();
    if (remainingMs <= 0) {
      active = false;
      onExpire();
      return;
    }
    handle = scheduler.schedule(tick, Math.min(remainingMs, 2_147_483_647));
  };
  tick();
  return () => {
    active = false;
    if (handle !== undefined) scheduler.cancel(handle);
  };
}
