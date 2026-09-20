import { describe, expect, it } from "vitest";
import {
  MAX_RESUME_AGE_MS,
  SESSION_STORE_KEY,
  SESSION_STORE_VERSION,
  clearSessionStore,
  createSessionStoreAdapter,
  getBrowserSessionStorage,
  readSessionStore,
  writeSessionStore,
  type SessionStoreState,
  type StoredRound,
} from "@/lib/numberLineJumper/sessionStore";

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();

  get length(): number { return this.values.size; }
  clear(): void { this.values.clear(); }
  getItem(key: string): string | null { return this.values.get(key) ?? null; }
  key(index: number): string | null { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string): void { this.values.delete(key); }
  setItem(key: string, value: string): void { this.values.set(key, value); }
}

const TARGET = {
  value: 0.5,
  display: "1/2",
  kind: "fraction" as const,
  range: { min: 0, max: 1 },
  intent: "midpoint" as const,
};

function round(overrides: Partial<StoredRound> = {}): StoredRound {
  return {
    version: SESSION_STORE_VERSION,
    savedAt: 10_000,
    roundNumber: 1,
    band: "g12",
    mode: "guided",
    phase: "playing",
    targetIndex: 0,
    target: TARGET,
    trials: [],
    scoreTotal: 0,
    timeLeft: 60,
    markerNorm: 0.5,
    committed: false,
    seed: 291,
    rngCalls: 4,
    adaptiveGeneratorState: {
      previousRepresentation: null,
      seenRepresentations: [],
      activeWeakSide: null,
      quotaPosition: 0,
      quotaBiased: 0,
    },
    ...overrides,
  };
}

function state(overrides: Partial<SessionStoreState> = {}): SessionStoreState {
  return {
    version: SESSION_STORE_VERSION,
    bests: { averageError: 0.12, closeStreak: 4 },
    inProgress: round(),
    nextRoundNumber: 2,
    ...overrides,
  };
}

const TRIAL = {
  completed: true as const,
  error: 0.1,
  closeness: "close" as const,
  points: 6,
  absoluteError: 0.1,
  playerValue: 0.4,
  targetValue: 0.5,
  direction: "low" as const,
  kind: "fraction" as const,
  range: { min: 0, max: 1 },
  intent: "midpoint" as const,
};

function playingRound(overrides: Partial<StoredRound> = {}): StoredRound {
  return round({ targetIndex: 1, trials: [TRIAL], ...overrides });
}

function readInvalid(value: unknown): SessionStoreState {
  const storage = new MemoryStorage();
  storage.setItem(SESSION_STORE_KEY, JSON.stringify({
    version: SESSION_STORE_VERSION,
    bests: null,
    inProgress: value,
    nextRoundNumber: 1,
  }));
  const result = readSessionStore(storage, 10_000);
  expect(result.inProgress).toBeNull();
  return result;
}

describe("browser-tab session store", () => {
  it("round-trips the allowlisted session state", () => {
    const storage = new MemoryStorage();
    writeSessionStore(storage, state());

    expect(readSessionStore(storage, 10_001)).toEqual(state());
    expect(storage.getItem(SESSION_STORE_KEY)).not.toContain("learner");
    expect(storage.getItem(SESSION_STORE_KEY)).not.toContain("account");
    expect(storage.getItem(SESSION_STORE_KEY)).not.toContain("free text");
  });

  it("keeps valid session bests when there is no interrupted round", () => {
    const storage = new MemoryStorage();
    const expected = state({ inProgress: null });
    writeSessionStore(storage, expected);

    expect(readSessionStore(storage, 10_001)).toEqual(expected);
    expect(storage.length).toBe(1);
  });

  it("discards stale, future, impossible, and schema-mismatched resumes", () => {
    const cases = [
      round({ savedAt: 10_000 - MAX_RESUME_AGE_MS - 1 }),
      round({ savedAt: 10_000 + 5 * 60 * 1_000 + 1 }),
      round({ targetIndex: 1 }),
      round({ phase: "reveal", committed: false }),
      round({ target: { ...TARGET, value: 2 } }),
    ];

    for (const candidate of cases) {
      const storage = new MemoryStorage();
      storage.setItem(SESSION_STORE_KEY, JSON.stringify(state({ inProgress: candidate })));
      const result = readSessionStore(storage, 10_000);
      expect(result.inProgress).toBeNull();
      expect(storage.getItem(SESSION_STORE_KEY)).toBeNull();
    }

    const mismatched = new MemoryStorage();
    mismatched.setItem(SESSION_STORE_KEY, JSON.stringify({ ...state(), version: 99 }));
    expect(readSessionStore(mismatched, 10_000)).toEqual({
      version: SESSION_STORE_VERSION,
      bests: null,
      inProgress: null,
      nextRoundNumber: 1,
    });
  });

  it("rejects each unsafe round field instead of coercing it", () => {
    const invalidRounds: unknown[] = [
      null,
      [],
      { ...playingRound(), version: 99 },
      { ...playingRound(), savedAt: Number.NaN },
      { ...playingRound(), roundNumber: 0 },
      { ...playingRound(), band: "g99" },
      { ...playingRound(), mode: "other" },
      { ...playingRound(), phase: "done" },
      { ...playingRound(), targetIndex: -1 },
      { ...playingRound(), target: null },
      { ...playingRound(), target: { ...TARGET, display: "" } },
      { ...playingRound(), target: { ...TARGET, kind: "other" } },
      { ...playingRound(), target: { ...TARGET, range: { min: 1, max: 1 } } },
      { ...playingRound(), target: { ...TARGET, intent: "other" } },
      { ...playingRound(), trials: [{ ...TRIAL, completed: false }] },
      { ...playingRound(), trials: [{ ...TRIAL, error: -1 }] },
      { ...playingRound(), trials: [{ ...TRIAL, closeness: "other" }] },
      { ...playingRound(), trials: [{ ...TRIAL, points: 11 }] },
      { ...playingRound(), trials: [{ ...TRIAL, absoluteError: -1 }] },
      { ...playingRound(), trials: [{ ...TRIAL, playerValue: Number.NaN }] },
      { ...playingRound(), trials: [{ ...TRIAL, targetValue: Number.POSITIVE_INFINITY }] },
      { ...playingRound(), trials: [{ ...TRIAL, direction: "other" }] },
      { ...playingRound(), trials: [{ ...TRIAL, kind: "other" }] },
      { ...playingRound(), trials: [{ ...TRIAL, range: { min: 1, max: 1 } }] },
      { ...playingRound(), trials: [{ ...TRIAL, intent: "other" }] },
      { ...playingRound(), scoreTotal: -1 },
      { ...playingRound(), timeLeft: 61 },
      { ...playingRound(), markerNorm: 2 },
      { ...playingRound(), committed: false, phase: "reveal" },
      { ...playingRound(), seed: -1 },
      { ...playingRound(), rngCalls: -1 },
      { ...playingRound(), adaptiveGeneratorState: null },
      { ...playingRound(), adaptiveGeneratorState: { ...playingRound().adaptiveGeneratorState, seenRepresentations: ["whole", "whole"] } },
      { ...playingRound(), adaptiveGeneratorState: { ...playingRound().adaptiveGeneratorState, previousRepresentation: "other" } },
      { ...playingRound(), adaptiveGeneratorState: { ...playingRound().adaptiveGeneratorState, activeWeakSide: "other" } },
      { ...playingRound(), adaptiveGeneratorState: { ...playingRound().adaptiveGeneratorState, quotaPosition: 5 } },
      { ...playingRound(), adaptiveGeneratorState: { ...playingRound().adaptiveGeneratorState, quotaBiased: 4 } },
    ];

    for (const candidate of invalidRounds) readInvalid(candidate);
  });

  it("handles invalid top-level records and the adapter boundary", () => {
    const storage = new MemoryStorage();
    storage.setItem(SESSION_STORE_KEY, JSON.stringify({ version: SESSION_STORE_VERSION, bests: { averageError: -1 }, inProgress: null, nextRoundNumber: 0 }));
    expect(readSessionStore(storage, 10_000)).toEqual({ version: SESSION_STORE_VERSION, bests: null, inProgress: null, nextRoundNumber: 1 });

    expect(readSessionStore(null, 10_000).nextRoundNumber).toBe(1);
    writeSessionStore(null, state());
    clearSessionStore(null);
  });

  it("fails closed when browser storage throws", () => {
    const throwing = {
      get length() { throw new Error("no storage"); },
      clear() { throw new Error("no storage"); },
      getItem() { throw new Error("no storage"); },
      key() { throw new Error("no storage"); },
      removeItem() { throw new Error("no storage"); },
      setItem() { throw new Error("no storage"); },
    } as unknown as Storage;
    expect(readSessionStore(throwing, 10_000).inProgress).toBeNull();
    writeSessionStore(throwing, state());
    clearSessionStore(throwing);
  });

  it("exposes guarded adapter methods and returns null outside a browser", () => {
    const storage = new MemoryStorage();
    const adapter = createSessionStoreAdapter(storage, () => 10_000);
    adapter.write(state());
    expect(adapter.read()).toEqual(state());
    adapter.clear();
    expect(adapter.read().inProgress).toBeNull();
    expect(getBrowserSessionStorage()).toBeNull();
  });

  it("discards malformed JSON and supports explicit deletion", () => {
    const storage = new MemoryStorage();
    storage.setItem(SESSION_STORE_KEY, "not-json");
    expect(readSessionStore(storage, 10_000).inProgress).toBeNull();

    writeSessionStore(storage, state());
    clearSessionStore(storage);
    expect(storage.length).toBe(0);
  });
});
