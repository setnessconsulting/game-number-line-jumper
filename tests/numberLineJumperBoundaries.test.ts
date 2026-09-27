import { describe, expect, it } from "vitest";
import {
  CLOSE_THRESHOLD,
  EXACT_THRESHOLD,
  createAdaptiveTargetGeneratorState,
  formatNumberValue,
  generateAdaptiveTarget,
  generateRoundTargets,
  generateTarget,
  mulberry32,
  rangesForBand,
  rangesForFraction,
  ROUND_MAX_TRIALS,
  scorePlacement,
  summarizeRound,
  valueAtPosition,
} from "@/lib/numberLineJumper/engine";
import { soundCueForError } from "@/lib/numberLineJumper/sound";
import { updateVisitBests } from "@/lib/numberLineJumper/visitBests";
import { sessionAggregates } from "@/lib/numberLineJumper/aggregates";
import type { NumberKind, PlacementBand, Range, Target, TrialRecord } from "@/lib/numberLineJumper/types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const BANDS: readonly PlacementBand[] = ["g12", "g34", "g56", "g78"];

/** Every configured range across all bands, including the fraction-only pool. */
const ALL_RANGES: readonly Range[] = [
  { min: 0, max: 10 },
  { min: 0, max: 20 },
  { min: 0, max: 100 },
  { min: 0, max: 1 },
  { min: 0, max: 2 },
  { min: 0, max: 3 },
  { min: 0, max: 1000 },
  { min: -10, max: 10 },
];

function makeTarget(value: number, kind: NumberKind, range: Range): Target {
  return { value, display: formatNumberValue(value), kind, range };
}

function normOnRange(value: number, range: Range): number {
  return (value - range.min) / (range.max - range.min);
}

/** A full ten-trial round of completed records built through scorePlacement. */
function fullRoundTrials(band: PlacementBand, seed: number): TrialRecord[] {
  const targets = generateRoundTargets(band, mulberry32(seed), ROUND_MAX_TRIALS, "guided");
  return targets.map((target, index) => {
    const offset = index % 3 === 0 ? 0.04 : -0.04;
    const norm = Math.min(1, Math.max(0, normOnRange(target.value, target.range) + offset));
    const score = scorePlacement(norm, target);
    return {
      completed: true,
      error: score.error,
      closeness: score.closeness,
      points: score.points,
      direction: score.direction,
      kind: target.kind,
      range: target.range,
      intent: target.intent,
    };
  });
}

// ---------------------------------------------------------------------------
// Scoring — relative-error threshold boundaries
//
// Regression: mirrored placements around a midpoint target (for example 0.45
// and 0.55 on a 0–1 line) are nominally the same distance from the target,
// but the raw `error <= threshold` comparison classified one side as exact
// and the other as close whenever float dust pushed one representative one
// ulp past the threshold. Threshold membership must be inclusive and stable
// against that dust so mirrored landings always tier identically.
// ---------------------------------------------------------------------------

describe("scorePlacement — relative-error threshold boundaries", () => {
  const midpointTarget = makeTarget(0.5, "decimal", { min: 0, max: 1 });

  it("locks the published threshold constants", () => {
    expect(EXACT_THRESHOLD).toBe(0.05);
    expect(CLOSE_THRESHOLD).toBe(0.15);
  });

  it("classifies one unit inside each threshold on the unit line", () => {
    // Positions 0.46 / 0.36 sit 0.04 / 0.14 from the 0.5 target.
    expect(scorePlacement(0.46, midpointTarget).closeness).toBe("exact");
    expect(scorePlacement(0.36, midpointTarget).closeness).toBe("close");
  });

  it("classifies exactly-threshold error as the better tier (inclusive ≤)", () => {
    // A target on the minimum endpoint keeps the arithmetic exact, so these
    // placements produce errors of exactly 0.05 and 0.15.
    const minTarget = makeTarget(0, "whole", { min: 0, max: 1 });
    expect(scorePlacement(0.05, minTarget).closeness).toBe("exact");
    expect(scorePlacement(0.15, minTarget).closeness).toBe("close");
  });

  it("classifies clearly-outside error as the worse tier (off-by-one guard)", () => {
    const minTarget = makeTarget(0, "whole", { min: 0, max: 1 });
    expect(scorePlacement(0.06, minTarget).closeness).toBe("close");
    expect(scorePlacement(0.16, minTarget).closeness).toBe("far");
  });

  it("tiers mirrored midpoint placements identically at the exact threshold", () => {
    // 0.45 and 0.55 sit exactly 5 % from the midpoint of a 0–1 line.
    const low = scorePlacement(0.45, midpointTarget);
    const high = scorePlacement(0.55, midpointTarget);
    expect(low.closeness).toBe("exact");
    expect(high.closeness).toBe("exact");
    expect(low.points).toBe(high.points);
  });

  it("tiers mirrored midpoint placements identically at the close threshold", () => {
    // 0.35 and 0.65 sit exactly 15 % from the midpoint of a 0–1 line.
    expect(scorePlacement(0.35, midpointTarget).closeness).toBe("close");
    expect(scorePlacement(0.65, midpointTarget).closeness).toBe("close");
  });

  it("tiers the two endpoint landings that sit exactly on the exact threshold", () => {
    // |0.05 − 0| = 0.05 from a target at the minimum endpoint, and
    // |0.95 − 1| = 0.05 from a target at the maximum endpoint.
    const minTarget = makeTarget(0, "whole", { min: 0, max: 1 });
    const maxTarget = makeTarget(1, "whole", { min: 0, max: 1 });
    const atMin = scorePlacement(0.05, minTarget);
    const atMax = scorePlacement(0.95, maxTarget);
    expect(atMin.closeness).toBe("exact");
    expect(atMax.closeness).toBe("exact");
    expect(atMax.points).toBe(atMin.points);
  });

  it("tiers mirrored whole-number placements around a 0–100 midpoint identically", () => {
    const target = makeTarget(50, "whole", { min: 0, max: 100 });
    expect(scorePlacement(normOnRange(45, target.range), target).closeness).toBe("exact");
    expect(scorePlacement(normOnRange(55, target.range), target).closeness).toBe("exact");
    expect(scorePlacement(normOnRange(35, target.range), target).closeness).toBe("close");
    expect(scorePlacement(normOnRange(65, target.range), target).closeness).toBe("close");
  });
});

// ---------------------------------------------------------------------------
// Scoring — zero, negatives, endpoints, and invalid placements
// ---------------------------------------------------------------------------

describe("scorePlacement — number-line domain boundaries", () => {
  it("scores a placement exactly on the target as spot-on with full points", () => {
    const target = makeTarget(-4, "negative", { min: -10, max: 10 });
    const score = scorePlacement(normOnRange(-4, target.range), target);
    expect(score.error).toBe(0);
    expect(score.direction).toBe("spot");
    expect(score.closeness).toBe("exact");
    expect(score.points).toBe(10);
    expect(score.playerValue).toBeCloseTo(-4, 12);
  });

  it("treats zero as an interior value on a bidirectional line", () => {
    const target = makeTarget(0, "whole", { min: -10, max: 10 });
    const onZero = scorePlacement(0.5, target);
    expect(onZero.error).toBe(0);
    expect(onZero.direction).toBe("spot");
    expect(onZero.targetNormalized).toBe(0.5);
    const below = scorePlacement(normOnRange(-0.5, target.range), target);
    const above = scorePlacement(normOnRange(0.5, target.range), target);
    expect(below.direction).toBe("low");
    expect(above.direction).toBe("high");
    expect(below.error).toBeCloseTo(0.025, 12);
    expect(above.error).toBeCloseTo(0.025, 12);
  });

  it("tiers one-unit misses around a negative integer target at the exact boundary", () => {
    const target = makeTarget(-4, "negative", { min: -10, max: 10 });
    const before = scorePlacement(normOnRange(-5, target.range), target);
    const after = scorePlacement(normOnRange(-3, target.range), target);
    expect(before.error).toBeCloseTo(0.05, 12);
    expect(after.error).toBeCloseTo(0.05, 12);
    expect(before.closeness).toBe("exact");
    expect(after.closeness).toBe("exact");
    expect(before.points).toBe(10);
    expect(after.points).toBe(10);
    expect(before.direction).toBe("low");
    expect(after.direction).toBe("high");
  });

  it("scores mirrored placements around a negative target symmetrically", () => {
    const target = makeTarget(-4, "negative", { min: -10, max: 10 });
    const low = scorePlacement(normOnRange(-6, target.range), target);
    const high = scorePlacement(normOnRange(-2, target.range), target);
    expect(low.closeness).toBe("close");
    expect(high.closeness).toBe("close");
    expect(low.error).toBeCloseTo(high.error, 12);
    expect(low.points).toBe(high.points);
  });

  it("scores an overshoot past the target as high with mirrored error", () => {
    const target = makeTarget(4, "whole", { min: 0, max: 10 });
    const overshoot = scorePlacement(normOnRange(6, target.range), target);
    const undershoot = scorePlacement(normOnRange(2, target.range), target);
    expect(overshoot.direction).toBe("high");
    expect(undershoot.direction).toBe("low");
    expect(overshoot.error).toBeCloseTo(undershoot.error, 15);
    expect(overshoot.points).toBe(undershoot.points);
  });

  it("scores one-unit misses on the g12 decade line as close, not exact", () => {
    const target = makeTarget(5, "whole", { min: 0, max: 10 });
    expect(scorePlacement(normOnRange(4, target.range), target).closeness).toBe("close");
    expect(scorePlacement(normOnRange(6, target.range), target).closeness).toBe("close");
    expect(scorePlacement(normOnRange(3, target.range), target).closeness).toBe("far");
  });

  it("scores one-unit misses around a large-range target as exact", () => {
    const target = makeTarget(500, "whole", { min: 0, max: 1000 });
    const before = scorePlacement(normOnRange(499, target.range), target);
    const after = scorePlacement(normOnRange(501, target.range), target);
    expect(before.closeness).toBe("exact");
    expect(after.closeness).toBe("exact");
    expect(before.direction).toBe("low");
    expect(after.direction).toBe("high");
    expect(before.error).toBeCloseTo(after.error, 15);
  });
});

// ---------------------------------------------------------------------------
// Scoring — endpoints and clamping (invalid / extreme placements)
// ---------------------------------------------------------------------------

describe("scorePlacement — endpoints and clamping", () => {
  it("lands exactly on the minimum endpoint of every configured range with full points", () => {
    for (const range of ALL_RANGES) {
      const target = makeTarget(range.min, "whole", range);
      const score = scorePlacement(0, target);
      expect(score.playerValue, JSON.stringify(range)).toBe(range.min);
      expect(score.playerNormalized).toBe(0);
      expect(score.error).toBe(0);
      expect(score.closeness).toBe("exact");
      expect(score.points).toBe(10);
      expect(score.direction).toBe("spot");
    }
  });

  it("lands exactly on the maximum endpoint of every configured range with full points", () => {
    for (const range of ALL_RANGES) {
      const target = makeTarget(range.max, "whole", range);
      const score = scorePlacement(1, target);
      expect(score.playerValue, JSON.stringify(range)).toBe(range.max);
      expect(score.playerNormalized).toBe(1);
      expect(score.error).toBe(0);
      expect(score.closeness).toBe("exact");
      expect(score.points).toBe(10);
      expect(score.direction).toBe("spot");
      expect(score.targetNormalized).toBe(1);
    }
  });

  it("keeps out-of-line placements clamped to the endpoints with defined scores", () => {
    for (const range of ALL_RANGES) {
      const target = makeTarget(range.max, "whole", range);
      const undershoot = scorePlacement(-1, target);
      const overshoot = scorePlacement(2, target);
      expect(undershoot.playerNormalized).toBe(0);
      expect(undershoot.playerValue).toBe(range.min);
      expect(overshoot.playerNormalized).toBe(1);
      expect(overshoot.playerValue).toBe(range.max);
      expect(Number.isFinite(undershoot.error)).toBe(true);
      expect(Number.isFinite(overshoot.error)).toBe(true);
    }
  });

  it("keeps infinite placements clamped to defined endpoint scores", () => {
    const target = makeTarget(0.5, "decimal", { min: 0, max: 1 });
    const low = scorePlacement(Number.NEGATIVE_INFINITY, target);
    const high = scorePlacement(Number.POSITIVE_INFINITY, target);
    expect(low.playerNormalized).toBe(0);
    expect(low.error).toBe(0.5);
    expect(high.playerNormalized).toBe(1);
    expect(high.error).toBe(0.5);
  });
});

// ---------------------------------------------------------------------------
// Marker movement — valueAtPosition across zero and at the endpoints
// ---------------------------------------------------------------------------

describe("marker movement — valueAtPosition", () => {
  it("moves one unit left and right across zero on the negative band", () => {
    const range: Range = { min: -10, max: 10 };
    expect(valueAtPosition(0.5, range)).toBe(0);
    expect(valueAtPosition(0.5 - 1 / 20, range)).toBeCloseTo(-1, 12);
    expect(valueAtPosition(0.5 + 1 / 20, range)).toBeCloseTo(1, 12);
  });

  it("clamps movement beyond either endpoint back onto the line", () => {
    const range: Range = { min: -10, max: 10 };
    expect(valueAtPosition(-1, range)).toBe(-10);
    expect(valueAtPosition(0, range)).toBe(-10);
    expect(valueAtPosition(2, range)).toBe(10);
    expect(valueAtPosition(1, range)).toBe(10);
  });

  it("round-trips every landmark position on every configured range", () => {
    for (const range of ALL_RANGES) {
      for (const norm of [0, 0.25, 0.5, 0.75, 1]) {
        const value = valueAtPosition(norm, range);
        expect(Number.isFinite(value), JSON.stringify(range)).toBe(true);
        expect(value).toBeGreaterThanOrEqual(range.min);
        expect(value).toBeLessThanOrEqual(range.max);
        expect((value - range.min) / (range.max - range.min)).toBeCloseTo(norm, 12);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Target generation — domain, zero handling, and reachability
// ---------------------------------------------------------------------------

describe("generated targets — domain and reachability invariants", () => {
  it("keeps every generated target finite and inside its declared range", () => {
    for (const band of BANDS) {
      for (let seed = 0; seed < 120; seed += 1) {
        const targets = generateRoundTargets(band, mulberry32(70_000 + seed), ROUND_MAX_TRIALS, "guided");
        for (const target of targets) {
          expect(Number.isFinite(target.value), `${band} seed ${seed}`).toBe(true);
          expect(target.value).toBeGreaterThanOrEqual(target.range.min);
          expect(target.value).toBeLessThanOrEqual(target.range.max);
          expect(target.range.max).toBeGreaterThan(target.range.min);
        }
      }
    }
  });

  it("never generates a value below any band's minimum endpoint (including −10)", () => {
    for (const band of BANDS) {
      const minimum = Math.min(...rangesForBand(band).map((range) => range.min));
      const targets = generateRoundTargets(band, mulberry32(606), 60, "challenge");
      for (const target of targets) {
        expect(target.value, `${band} ${target.display}`).toBeGreaterThanOrEqual(minimum);
      }
    }
  });

  it("can generate values on both sides of zero on the negative band", () => {
    const targets = Array.from({ length: 600 }, (_, seed) => generateTarget("g78", mulberry32(80_000 + seed)));
    expect(targets.some((target) => target.value < 0)).toBe(true);
    expect(targets.some((target) => target.value > 0)).toBe(true);
    for (const target of targets.filter((item) => item.range.min === -10)) {
      expect(target.value).toBeGreaterThanOrEqual(-10);
      expect(target.value).toBeLessThanOrEqual(10);
    }
  });

  it("never emits a zero-valued signed fraction on the negative band", () => {
    for (let seed = 0; seed < 1200; seed += 1) {
      const target = generateTarget("g78", mulberry32(300_000 + seed));
      if (target.kind !== "fraction" || target.range.min !== -10) continue;
      expect(target.value).not.toBe(0);
      expect(target.display).not.toMatch(/^−?0/);
    }
  });

  it("keeps every generated target reachable: placing exactly on it scores exact full points", () => {
    for (const band of BANDS) {
      const targets = generateRoundTargets(band, mulberry32(90_001), 30, "guided");
      for (const target of targets) {
        const norm = normOnRange(target.value, target.range);
        const score = scorePlacement(norm, target);
        expect(score.closeness, `${band} ${target.display}`).toBe("exact");
        expect(score.points).toBe(10);
      }
    }
  });

  it("replays identical rounds for identical seeds across every band and mode", () => {
    for (const band of BANDS) {
      for (const mode of ["guided", "challenge"] as const) {
        const first = generateRoundTargets(band, mulberry32(123_456), ROUND_MAX_TRIALS, mode);
        const second = generateRoundTargets(band, mulberry32(123_456), ROUND_MAX_TRIALS, mode);
        expect(first, `${band} ${mode}`).toEqual(second);
      }
    }
  });

  it("generates an empty round for a zero-trial request", () => {
    expect(generateRoundTargets("g12", mulberry32(1), 0)).toEqual([]);
    expect(generateRoundTargets("g56", mulberry32(1), 0, "challenge")).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Round-state invariants — scoring once, terminal stability, reset, retry
// ---------------------------------------------------------------------------

describe("state invariants — round handling, reset, and retry", () => {
  it("a complete round sums trial points exactly once in the summary", () => {
    for (const band of BANDS) {
      const trials = fullRoundTrials(band, 4242);
      expect(trials).toHaveLength(ROUND_MAX_TRIALS);
      const summary = summarizeRound(trials);
      expect(summary.trials).toBe(ROUND_MAX_TRIALS);
      expect(summary.totalPoints).toBe(trials.reduce((sum, trial) => sum + trial.points, 0));
    }
  });

  it("re-summarizing a finished round is stable (terminal state cannot double-advance)", () => {
    const trials = fullRoundTrials("g78", 4242);
    const first = summarizeRound(trials);
    const second = summarizeRound(trials);
    expect(second).toEqual(first);
    expect(second.totalPoints).toBe(first.totalPoints);
  });

  it("folding the same finished round into visit bests twice records no second win", () => {
    const summary = summarizeRound(fullRoundTrials("g12", 777));
    const firstFold = updateVisitBests(null, summary);
    const secondFold = updateVisitBests(firstFold.bests, summary);
    expect(secondFold.bests).toEqual(firstFold.bests);
    expect(secondFold.delta.averageError).toBe(false);
    expect(secondFold.delta.closeStreak).toBe(false);
    expect(secondFold.bests?.averageError).toBe(summary.averageError);
    expect(secondFold.bests?.closeStreak).toBe(summary.bestStreak);
  });

  it("scoring the same placement repeatedly is pure and identical (commit-once data)", () => {
    const target = makeTarget(-7, "negative", { min: -10, max: 10 });
    const norm = normOnRange(-6.5, target.range);
    const first = scorePlacement(norm, target);
    for (let attempt = 0; attempt < 5; attempt += 1) {
      expect(scorePlacement(norm, target)).toEqual(first);
    }
  });

  it("reset restores the pristine generator state used at round start", () => {
    expect(createAdaptiveTargetGeneratorState()).toEqual({
      previousRepresentation: null,
      seenRepresentations: [],
      activeWeakSide: null,
      quotaPosition: 0,
      quotaBiased: 0,
    });
  });

  it("a retried round from pristine state replays identically", () => {
    const runRound = () => {
      const rng = mulberry32(31_337);
      let state = createAdaptiveTargetGeneratorState();
      const targets: Target[] = [];
      for (let index = 0; index < ROUND_MAX_TRIALS; index += 1) {
        const generated = generateAdaptiveTarget("g56", rng, index, "challenge", [], state, ROUND_MAX_TRIALS);
        state = generated.state;
        targets.push(generated.target);
      }
      return targets;
    };
    expect(runRound()).toEqual(runRound());
  });

  it("transitioning bands keeps every round inside that band's declared range pool", () => {
    for (const band of BANDS) {
      const allowed = band === "g56" ? rangesForFraction(band) : rangesForBand(band);
      const targets = generateRoundTargets(band, mulberry32(555), ROUND_MAX_TRIALS, "challenge");
      for (const target of targets) {
        expect(target.value).toBeGreaterThanOrEqual(target.range.min);
        expect(target.value).toBeLessThanOrEqual(target.range.max);
        const known = allowed.some((range) => range.min === target.range.min && range.max === target.range.max);
        expect(known, `${band} ${target.range.min}:${target.range.max}`).toBe(true);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Session aggregates and sound cues at the classification boundaries
// ---------------------------------------------------------------------------

describe("session aggregates — boundary-error classification", () => {
  it("classifies threshold-error trials exactly as the engine tiers them", () => {
    const make = (error: number, closeness: TrialRecord["closeness"]): TrialRecord => ({
      error,
      closeness,
      points: closeness === "exact" ? 10 : closeness === "close" ? 6 : 2,
      kind: "whole",
      range: { min: 0, max: 10 },
    });
    const trials = [make(0.05, "exact"), make(0.15, "close"), make(0.1500001, "far")];
    const result = sessionAggregates({ trials });
    expect(result.trials).toBe(3);
    expect(result.closeCount).toBe(2);
    expect(result.pctClose).toBeCloseTo((2 / 3) * 100, 10);
  });
});

describe("sound cue — threshold boundary consistency", () => {
  it("maps the raw threshold error to the better cue and just-past errors to the worse cue", () => {
    expect(soundCueForError(EXACT_THRESHOLD)).toBe("exact");
    expect(soundCueForError(EXACT_THRESHOLD + 1e-9)).toBe("close");
    expect(soundCueForError(CLOSE_THRESHOLD)).toBe("close");
    expect(soundCueForError(CLOSE_THRESHOLD + 1e-9)).toBe("far");
  });

  it("keeps the cue tier equal to the engine's closeness tier for mirrored boundary placements", () => {
    const target = makeTarget(0.5, "decimal", { min: 0, max: 1 });
    const cueForCloseness = { exact: "exact", close: "close", far: "far" } as const;
    for (const norm of [0.05, 0.15, 0.35, 0.45, 0.55, 0.65, 0.85, 0.95]) {
      const score = scorePlacement(norm, target);
      expect(soundCueForError(score.error), `norm ${norm}`).toBe(cueForCloseness[score.closeness]);
    }
  });
});
