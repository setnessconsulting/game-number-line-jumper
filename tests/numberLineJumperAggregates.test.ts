import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  generateRoundTargets,
  mulberry32,
  representationOf,
  scorePlacement,
  summarizeRound,
} from "@/lib/numberLineJumper/engine";
import {
  rangeKey,
  sessionAggregates,
  type NljSessionState,
} from "@/lib/numberLineJumper/aggregates";
import type { Target, TrialRecord } from "@/lib/numberLineJumper/types";

// ---------------------------------------------------------------------------
// Helpers — trials are built through the authoritative scorePlacement path
// ---------------------------------------------------------------------------

function trialFor(target: Target, playerNormalized: number): TrialRecord {
  const score = scorePlacement(playerNormalized, target);
  return {
    error: score.error,
    absoluteError: score.absoluteError,
    playerValue: score.playerValue,
    targetValue: score.targetValue,
    direction: score.direction,
    kind: target.kind,
    range: target.range,
    intent: target.intent,
    closeness: score.closeness,
    points: score.points,
  };
}

function stateOf(trials: readonly TrialRecord[]): NljSessionState {
  return { trials };
}

// ---------------------------------------------------------------------------
// LEVELBEST-61 AC: zero-trial session is well-defined and safe
// ---------------------------------------------------------------------------

describe("session aggregates — zero-trial session", () => {
  it("returns explicit nulls for unavailable numerics, never NaN or Infinity", () => {
    const result = sessionAggregates(stateOf([]));
    expect(result.trials).toBe(0);
    expect(result.closeCount).toBe(0);
    expect(result.avgRelativeError).toBeNull();
    expect(result.pctClose).toBeNull();
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain("NaN");
    expect(serialized).not.toContain("Infinity");
  });

  it("still exposes every canonical representation bucket at zero trials", () => {
    const { perRepresentation } = sessionAggregates(stateOf([]));
    expect(perRepresentation.whole).toEqual({ trials: 0, closeCount: 0, avgRelativeError: null, pctClose: null });
    expect(perRepresentation.fraction).toEqual({ trials: 0, closeCount: 0, avgRelativeError: null, pctClose: null });
    expect(perRepresentation.decimal).toEqual({ trials: 0, closeCount: 0, avgRelativeError: null, pctClose: null });
  });

  it("has an empty per-range map for a session with no trials", () => {
    expect(sessionAggregates(stateOf([])).perRange).toEqual({});
  });

  it("treats a session of entirely malformed records the same as zero trials", () => {
    const malformed: TrialRecord[] = [
      { error: Number.NaN, closeness: "close", points: 6 },
      { error: 0.1, closeness: "nonsense" as TrialRecord["closeness"], points: 6 },
      { error: -0.2, closeness: "far", points: 2 },
    ];
    expect(sessionAggregates(stateOf(malformed))).toEqual(sessionAggregates(stateOf([])));
  });
});

// ---------------------------------------------------------------------------
// LEVELBEST-61 AC: fixed fixture with exact avgRelativeError and pctClose
// ---------------------------------------------------------------------------

describe("session aggregates — fixed fixture", () => {
  const FIXTURE: TrialRecord[] = [
    { error: 0.02, closeness: "exact", points: 10, kind: "whole", range: { min: 0, max: 10 } },
    { error: 0.10, closeness: "close", points: 6, kind: "fraction", range: { min: 0, max: 1 } },
    { error: 0.14, closeness: "close", points: 6, kind: "decimal", range: { min: 0, max: 1 } },
    { error: 0.16, closeness: "far", points: 2, kind: "decimal", range: { min: 0, max: 1 } },
    { error: 0.33, closeness: "far", points: 2, kind: "whole", range: { min: 0, max: 10 } },
  ];

  it("computes the exact overall averages", () => {
    const result = sessionAggregates(stateOf(FIXTURE));
    expect(result.trials).toBe(5);
    expect(result.closeCount).toBe(3);
    // (0.02 + 0.10 + 0.14 + 0.16 + 0.33) / 5 = 0.75 / 5 = 0.15 exactly.
    expect(result.avgRelativeError).toBe(0.15);
    // 3 close of 5 = 60 exactly on the 0–100 scale.
    expect(result.pctClose).toBe(60);
  });

  it("matches the authoritative summarizeRound mean and close count", () => {
    const result = sessionAggregates(stateOf(FIXTURE));
    const summary = summarizeRound(FIXTURE);
    expect(result.avgRelativeError).toBe(summary.averageError);
    expect(result.closeCount).toBe(summary.closeCount);
  });

  it("keeps a zero-trial aggregate consistent with the documented null convention", () => {
    // RoundSummary zeroes its average for display convenience; the aggregate
    // contract documents null for unavailable numerics instead.
    const result = sessionAggregates(stateOf([]));
    expect(result.avgRelativeError).toBeNull();
    expect(result.pctClose).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// LEVELBEST-61 AC: representation breakdown uses canonical identifiers
// ---------------------------------------------------------------------------

describe("session aggregates — per-representation breakdown", () => {
  it("groups trials under the canonical whole/fraction/decimal keys", () => {
    const targets = generateRoundTargets("g56", mulberry32(20260903), 10, "challenge");
    const trials = targets.map((target, index) => trialFor(target, (index % 5) / 10));
    const result = sessionAggregates(stateOf(trials));

    let classified = 0;
    for (const trial of trials) {
      if (!trial.kind) continue;
      classified += 1;
      const bucket = result.perRepresentation[representationOf(trial.kind)];
      expect(bucket.trials).toBeGreaterThan(0);
    }
    expect(classified).toBe(10);

    const mixed = targets.some((t) => t.kind === "whole")
      && targets.some((t) => t.kind === "fraction")
      && targets.some((t) => t.kind === "decimal");
    if (mixed) {
      expect(result.perRepresentation.whole.trials).toBeGreaterThan(0);
      expect(result.perRepresentation.fraction.trials).toBeGreaterThan(0);
      expect(result.perRepresentation.decimal.trials).toBeGreaterThan(0);
    }
  });

  it("folds negative kind trials into the whole bucket via representationOf", () => {
    const trials: TrialRecord[] = [
      { error: 0.04, closeness: "exact", points: 10, kind: "negative", range: { min: -10, max: 10 } },
      { error: 0.10, closeness: "close", points: 6, kind: "whole", range: { min: -10, max: 10 } },
    ];
    const { perRepresentation } = sessionAggregates(stateOf(trials));
    expect(perRepresentation.whole).toEqual({ trials: 2, closeCount: 2, avgRelativeError: 0.07, pctClose: 100 });
    expect(perRepresentation.fraction.trials).toBe(0);
    expect(perRepresentation.decimal.trials).toBe(0);
  });

  it("computes exact per-representation stats", () => {
    const trials: TrialRecord[] = [
      { error: 0.02, closeness: "exact", points: 10, kind: "whole", range: { min: 0, max: 10 } },
      { error: 0.08, closeness: "close", points: 6, kind: "whole", range: { min: 0, max: 10 } },
      { error: 0.30, closeness: "far", points: 2, kind: "whole", range: { min: 0, max: 10 } },
      { error: 0.10, closeness: "close", points: 6, kind: "fraction", range: { min: 0, max: 1 } },
    ];
    const { perRepresentation } = sessionAggregates(stateOf(trials));
    expect(perRepresentation.whole).toEqual({ trials: 3, closeCount: 2, avgRelativeError: 0.4 / 3, pctClose: (2 / 3) * 100 });
    expect(perRepresentation.fraction).toEqual({ trials: 1, closeCount: 1, avgRelativeError: 0.1, pctClose: 100 });
    expect(perRepresentation.decimal).toEqual({ trials: 0, closeCount: 0, avgRelativeError: null, pctClose: null });
  });

  it("counts kind-less trials in the overall totals but in no representation bucket", () => {
    const trials: TrialRecord[] = [
      { error: 0.10, closeness: "close", points: 6, kind: "whole", range: { min: 0, max: 10 } },
      { error: 0.20, closeness: "far", points: 2 },
    ];
    const result = sessionAggregates(stateOf(trials));
    expect(result.trials).toBe(2);
    expect(result.closeCount).toBe(1);
    expect(result.perRepresentation.whole.trials).toBe(1);
    const bucketTotal =
      result.perRepresentation.whole.trials
      + result.perRepresentation.fraction.trials
      + result.perRepresentation.decimal.trials;
    expect(bucketTotal).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// LEVELBEST-61 AC: range breakdown uses canonical min:max identity
// ---------------------------------------------------------------------------

describe("session aggregates — per-range breakdown", () => {
  it("buckets distinct configured ranges separately under <min>:<max> keys", () => {
    const trials: TrialRecord[] = [
      { error: 0.02, closeness: "exact", points: 10, kind: "whole", range: { min: 0, max: 10 } },
      { error: 0.10, closeness: "close", points: 6, kind: "whole", range: { min: 0, max: 20 } },
      { error: 0.16, closeness: "far", points: 2, kind: "whole", range: { min: 0, max: 20 } },
      { error: 0.14, closeness: "close", points: 6, kind: "whole", range: { min: -10, max: 10 } },
    ];
    const { perRange } = sessionAggregates(stateOf(trials));
    expect(Object.keys(perRange)).toEqual(["-10:10", "0:10", "0:20"]);
    expect(perRange["0:10"]).toEqual({ min: 0, max: 10, trials: 1, closeCount: 1, avgRelativeError: 0.02, pctClose: 100 });
    expect(perRange["0:20"]).toEqual({ min: 0, max: 20, trials: 2, closeCount: 1, avgRelativeError: 0.13, pctClose: 50 });
    expect(perRange["-10:10"]).toEqual({ min: -10, max: 10, trials: 1, closeCount: 1, avgRelativeError: 0.14, pctClose: 100 });
  });

  it("reuses the same range identity as the engine's own range stats", () => {
    expect(rangeKey({ min: 0, max: 1 })).toBe("0:1");
    const trials: TrialRecord[] = [
      { error: 0.05, closeness: "exact", points: 10, kind: "decimal", range: { min: 0, max: 1 } },
    ];
    expect(Object.keys(sessionAggregates(stateOf(trials)).perRange)).toEqual(["0:1"]);
  });

  it("aggregates real generated g12 rounds across the configured ranges", () => {
    const targets = generateRoundTargets("g12", mulberry32(7), 30);
    const trials = targets.map((target) => trialFor(target, 0.5));
    const { perRange } = sessionAggregates(stateOf(trials));
    const configured = ["0:10", "0:20", "0:100"];
    const observed = Object.keys(perRange);
    // g12 draws each trial from its configured ranges, so every observed
    // bucket must be one of them, at least two appear across 30 trials, and
    // every bucket is fully aggregated.
    expect(observed.every((key) => configured.includes(key))).toBe(true);
    expect(observed.length).toBeGreaterThanOrEqual(2);
    for (const entry of Object.values(perRange)) {
      expect(entry.trials).toBeGreaterThan(0);
      expect(entry.pctClose).toBeGreaterThanOrEqual(0);
      expect(entry.pctClose).toBeLessThanOrEqual(100);
      expect(configured).toContain(rangeKey(entry));
    }
  });
});

// ---------------------------------------------------------------------------
// LEVELBEST-61 AC: determinism
// ---------------------------------------------------------------------------

describe("session aggregates — determinism", () => {
  it("repeated aggregation of the same state produces deep-equal output", () => {
    const targets = generateRoundTargets("g78", mulberry32(99), 10, "challenge");
    const state = stateOf(targets.map((target, index) => trialFor(target, (index % 4) / 5)));
    const first = sessionAggregates(state);
    const second = sessionAggregates(state);
    expect(first).toEqual(second);
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
  });

  it("aggregation never mutates the input state", () => {
    const targets = generateRoundTargets("g34", mulberry32(11), 6);
    const trials = targets.map((target) => trialFor(target, 0.42));
    const state = stateOf(trials);
    const snapshot = JSON.stringify(state);
    sessionAggregates(state);
    expect(JSON.stringify(state)).toBe(snapshot);
  });
});

// ---------------------------------------------------------------------------
// LEVELBEST-61 AC: single source of truth — the summary screen consumes the aggregate
// ---------------------------------------------------------------------------

describe("session aggregates — summary-screen integration", () => {
  const ROOT = process.cwd();
  const SHELL = join(ROOT, "src", "app", "games", "NumberLineJumper.tsx");

  it("the summary screen consumes sessionAggregates for percent-close", () => {
    const shell = readFileSync(SHELL, "utf8");
    expect(shell).toContain("sessionAggregates({ trials })");
    // The old inline recomputation must not return.
    expect(shell).not.toMatch(/closeCount\s*\/\s*summary\.trials/);
  });

  it("renders the aggregate average error, not a recomputed mean", () => {
    const shell = readFileSync(SHELL, "utf8");
    expect(shell).toContain("aggregates.avgRelativeError ?? 0");
    expect(shell).not.toMatch(/errorSum\s*\+=/);
  });
});

// ---------------------------------------------------------------------------
// LEVELBEST-61 AC: privacy boundary — session-only aggregate contract
// ---------------------------------------------------------------------------

describe("session aggregates — privacy boundary", () => {
  const ROOT = process.cwd();
  const AGGREGATES_MODULE = join(ROOT, "src", "lib", "numberLineJumper", "aggregates.ts");

  const FORBIDDEN = [
    /localStorage/,
    /sessionStorage/,
    /indexedDB/,
    /document\.cookie/,
    /\bfetch\s*\(/,
    /\bXMLHttpRequest\b/,
    /\bWebSocket\s*\(/,
    /\bEventSource\s*\(/,
    /navigator\.sendBeacon/,
  ];

  it("contains no storage or network persistence of any kind", () => {
    const source = readFileSync(AGGREGATES_MODULE, "utf8");
    for (const pattern of FORBIDDEN) {
      expect(source, `aggregates.ts must not match ${pattern}`).not.toMatch(pattern);
    }
  });

  it("carries aggregate metrics only — no identity of any kind", () => {
    const source = readFileSync(AGGREGATES_MODULE, "utf8");
    const FORBIDDEN_IDENTITY = [/child/i, /userId/i, /user_id/i, /learner/i, /student/i, /email/i, /\bid\s*:/];
    for (const pattern of FORBIDDEN_IDENTITY) {
      expect(source, `aggregates.ts must not mention identity (${pattern})`).not.toMatch(pattern);
    }
  });

  it("is exposed as a pure function over immutable state", () => {
    const source = readFileSync(AGGREGATES_MODULE, "utf8");
    expect(source).toContain("export function sessionAggregates(state: NljSessionState): SessionAggregates");
    expect(source).not.toMatch(/new Date|Date\.now|Math\.random/);
  });
});
