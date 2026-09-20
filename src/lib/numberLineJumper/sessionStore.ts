import type { AdaptiveTargetGeneratorState } from "./engine";
import type { VisitBests } from "./visitBests";
import type { PlacementBand, RoundMode, Target, TrialRecord } from "./types";

/**
 * Browser-tab session continuity for Number Line Jumper.
 *
 * This is deliberately the only runtime module that touches sessionStorage.
 * The payload is a versioned allowlist of generated game facts only: there
 * are no names, free text, account identifiers, device data, or transport.
 */
export const SESSION_STORE_KEY = "number-line-jumper.session.v1";
export const SESSION_STORE_VERSION = 1 as const;
export const MAX_RESUME_AGE_MS = 24 * 60 * 60 * 1_000;
/** Build-time rollback switch; the default remains enabled. */
export const SESSION_RECORDS_ENABLED = import.meta.env.VITE_NLJ_SESSION_RECORDS !== "off";

export interface StoredRound {
  version: typeof SESSION_STORE_VERSION;
  savedAt: number;
  roundNumber: number;
  band: PlacementBand;
  mode: RoundMode;
  phase: "playing" | "reveal";
  targetIndex: number;
  target: Target;
  trials: TrialRecord[];
  scoreTotal: number;
  timeLeft: number;
  markerNorm: number;
  committed: boolean;
  seed: number;
  rngCalls: number;
  adaptiveGeneratorState: AdaptiveTargetGeneratorState;
}

export interface SessionStoreState {
  version: typeof SESSION_STORE_VERSION;
  bests: VisitBests | null;
  inProgress: StoredRound | null;
  nextRoundNumber: number;
}

export interface SessionStoreAdapter {
  read(): SessionStoreState;
  write(state: SessionStoreState): void;
  clear(): void;
}

/** Return the browser-tab store without letting storage errors cross the UI boundary. */
export function getBrowserSessionStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

const EMPTY_STATE: SessionStoreState = {
  version: SESSION_STORE_VERSION,
  bests: null,
  inProgress: null,
  nextRoundNumber: 1,
};

const REPRESENTATIONS = new Set(["whole", "fraction", "decimal"]);
const BANDS = new Set(["g12", "g34", "g56", "g78"]);
const KINDS = new Set(["whole", "fraction", "decimal", "negative"]);
const CLOSENESS = new Set(["exact", "close", "far"]);
const DIRECTIONS = new Set(["low", "high", "spot"]);
const INTENTS = new Set(["anchor", "interior", "midpoint", "contrast", "mixed"]);

function cloneEmptyState(): SessionStoreState {
  return { ...EMPTY_STATE };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value);
}

function isUnit(value: unknown): value is number {
  return isFiniteNumber(value) && value >= 0 && value <= 1;
}

function isRange(value: unknown): value is { min: number; max: number } {
  if (!isRecord(value) || !isFiniteNumber(value.min) || !isFiniteNumber(value.max)) return false;
  return value.max > value.min;
}

function isTarget(value: unknown): value is Target {
  if (!isRecord(value)) return false;
  if (!isFiniteNumber(value.value) || typeof value.display !== "string" || value.display.length === 0 || value.display.length > 64) return false;
  if (typeof value.kind !== "string" || !KINDS.has(value.kind)) return false;
  if (!isRange(value.range) || value.value < value.range.min || value.value > value.range.max) return false;
  return value.intent === undefined || (typeof value.intent === "string" && INTENTS.has(value.intent));
}

function isTrialRecord(value: unknown): value is TrialRecord {
  if (!isRecord(value)) return false;
  if (value.completed !== true && value.completed !== undefined) return false;
  if (!isFiniteNumber(value.error) || value.error < 0) return false;
  if (typeof value.closeness !== "string" || !CLOSENESS.has(value.closeness)) return false;
  if (!isInteger(value.points) || value.points < 0 || value.points > 10) return false;
  if (value.absoluteError !== undefined && (!isFiniteNumber(value.absoluteError) || value.absoluteError < 0)) return false;
  if (value.playerValue !== undefined && !isFiniteNumber(value.playerValue)) return false;
  if (value.targetValue !== undefined && !isFiniteNumber(value.targetValue)) return false;
  if (value.direction !== undefined && (typeof value.direction !== "string" || !DIRECTIONS.has(value.direction))) return false;
  if (value.kind !== undefined && (typeof value.kind !== "string" || !KINDS.has(value.kind))) return false;
  if (value.range !== undefined && !isRange(value.range)) return false;
  if (value.intent !== undefined && (typeof value.intent !== "string" || !INTENTS.has(value.intent))) return false;
  return true;
}

function isAdaptiveState(value: unknown): value is AdaptiveTargetGeneratorState {
  if (!isRecord(value)) return false;
  const seen = value.seenRepresentations;
  if (!Array.isArray(seen) || seen.some((item) => typeof item !== "string" || !REPRESENTATIONS.has(item))) return false;
  if (new Set(seen).size !== seen.length) return false;
  if (value.previousRepresentation !== null && (typeof value.previousRepresentation !== "string" || !REPRESENTATIONS.has(value.previousRepresentation))) return false;
  if (value.activeWeakSide !== null && value.activeWeakSide !== "low" && value.activeWeakSide !== "high") return false;
  if (!isInteger(value.quotaPosition) || value.quotaPosition < 0 || value.quotaPosition > 4) return false;
  if (!isInteger(value.quotaBiased) || value.quotaBiased < 0 || value.quotaBiased > value.quotaPosition || value.quotaBiased > 3) return false;
  return true;
}

function isBests(value: unknown): value is VisitBests {
  if (!isRecord(value)) return false;
  return isFiniteNumber(value.averageError) && value.averageError >= 0 && value.averageError <= 1
    && isInteger(value.closeStreak) && value.closeStreak >= 0 && value.closeStreak <= 10;
}

function isStoredRound(value: unknown, nowMs: number): value is StoredRound {
  if (!isRecord(value)) return false;
  if (value.version !== SESSION_STORE_VERSION || !isFiniteNumber(value.savedAt)) return false;
  if (value.savedAt > nowMs + 5 * 60 * 1_000 || nowMs - value.savedAt > MAX_RESUME_AGE_MS) return false;
  if (!isInteger(value.roundNumber) || value.roundNumber < 1) return false;
  if (typeof value.band !== "string" || !BANDS.has(value.band)) return false;
  if (value.mode !== "guided" && value.mode !== "challenge") return false;
  if (value.phase !== "playing" && value.phase !== "reveal") return false;
  if (!isInteger(value.targetIndex) || value.targetIndex < 0 || value.targetIndex >= 10) return false;
  if (!isTarget(value.target) || !Array.isArray(value.trials) || value.trials.length > 10 || value.trials.some((trial) => !isTrialRecord(trial))) return false;
  if (value.trials.length !== value.targetIndex + (value.committed === true ? 1 : 0)) return false;
  if (!isInteger(value.scoreTotal) || value.scoreTotal < 0 || value.scoreTotal > 100) return false;
  if (!isInteger(value.timeLeft) || value.timeLeft < 0 || value.timeLeft > 60) return false;
  if (!isUnit(value.markerNorm)) return false;
  if (typeof value.committed !== "boolean" || value.committed !== (value.phase === "reveal")) return false;
  if (!isInteger(value.seed) || value.seed < 0 || value.seed > 0xffffffff) return false;
  if (!isInteger(value.rngCalls) || value.rngCalls < 0 || value.rngCalls > 100_000) return false;
  return isAdaptiveState(value.adaptiveGeneratorState);
}

function parseState(raw: string | null, nowMs: number): SessionStoreState {
  if (!raw) return cloneEmptyState();
  try {
    const value: unknown = JSON.parse(raw);
    if (!isRecord(value) || value.version !== SESSION_STORE_VERSION) return cloneEmptyState();
    const bests = value.bests === null ? null : isBests(value.bests) ? value.bests : null;
    const inProgress = value.inProgress === null ? null : isStoredRound(value.inProgress, nowMs) ? value.inProgress : null;
    const nextRoundNumber = isInteger(value.nextRoundNumber) && value.nextRoundNumber >= 1 ? value.nextRoundNumber : 1;
    return { version: SESSION_STORE_VERSION, bests, inProgress, nextRoundNumber };
  } catch {
    return cloneEmptyState();
  }
}

/** Read a validated state from a caller-provided browser-tab store. */
export function readSessionStore(storage: Storage | null, nowMs = Date.now()): SessionStoreState {
  if (!storage) return cloneEmptyState();
  try {
    const raw = storage.getItem(SESSION_STORE_KEY);
    const state = parseState(raw, nowMs);
    if (raw !== null) {
      let hadInvalidInProgress = false;
      try {
        const rawValue: unknown = JSON.parse(raw);
        hadInvalidInProgress = isRecord(rawValue) && rawValue.version === SESSION_STORE_VERSION
          && rawValue.inProgress !== null && state.inProgress === null;
      } catch {
        hadInvalidInProgress = true;
      }
      if (hadInvalidInProgress) storage.removeItem(SESSION_STORE_KEY);
    }
    return state;
  } catch {
    return cloneEmptyState();
  }
}

/** Write only the validated top-level shape; storage failures fail closed. */
export function writeSessionStore(storage: Storage | null, state: SessionStoreState): void {
  if (!storage) return;
  try {
    storage.setItem(SESSION_STORE_KEY, JSON.stringify({
      version: SESSION_STORE_VERSION,
      bests: state.bests,
      inProgress: state.inProgress,
      nextRoundNumber: state.nextRoundNumber,
    } satisfies SessionStoreState));
  } catch {
    // Private browsing, quota, and unavailable storage all fall back to memory.
  }
}

export function clearSessionStore(storage: Storage | null): void {
  if (!storage) return;
  try {
    storage.removeItem(SESSION_STORE_KEY);
  } catch {
    // Clearing is best effort; the current in-memory state is still reset.
  }
}

/** Build the adapter once so storage access remains a single guarded boundary. */
export function createSessionStoreAdapter(
  storage: Storage | null,
  now: () => number = () => Date.now(),
): SessionStoreAdapter {
  return {
    read: () => readSessionStore(storage, now()),
    write: (state) => writeSessionStore(storage, state),
    clear: () => clearSessionStore(storage),
  };
}
