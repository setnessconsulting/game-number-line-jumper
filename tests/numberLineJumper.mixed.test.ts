import { describe, expect, it } from "vitest";
import {
  CHALLENGE_TARGET_INTENTS,
  G58_CHALLENGE_REPRESENTATION_WEIGHTS,
  MIXED_REPRESENTATIONS,
  ROUND_MAX_TRIALS,
  ROUND_TARGET_INTENTS,
  generateRoundTargets,
  generateTarget,
  mulberry32,
  representationOf,
  summarizeRound,
  usesMixedChallengePool,
} from "@/lib/numberLineJumper/engine";
import type {
  MixedRepresentation,
  PlacementBand,
  RoundMode,
  Target,
  TrialRecord,
} from "@/lib/numberLineJumper/types";

const G58_BANDS: readonly PlacementBand[] = ["g56", "g78"];
const YOUNGER_BANDS: readonly PlacementBand[] = ["g12", "g34"];
const MIXED_SEEDS = [1, 7, 42, 99, 20260825, 314159, 271828, 123456, 9001, 17];

function mixedRound(band: PlacementBand, seed: number, count = ROUND_MAX_TRIALS): Target[] {
  return generateRoundTargets(band, mulberry32(seed), count, "challenge");
}

function representationsOf(targets: readonly Target[]): MixedRepresentation[] {
  return targets.map((target) => representationOf(target.kind));
}

function replayWithGenerateTarget(
  band: PlacementBand,
  seed: number,
  mode: RoundMode,
  count = ROUND_MAX_TRIALS,
): Target[] {
  const intents = mode === "challenge" ? CHALLENGE_TARGET_INTENTS : ROUND_TARGET_INTENTS;
  const rng = mulberry32(seed);
  return Array.from({ length: count }, (_, index) =>
    generateTarget(band, rng, intents[index % intents.length] ?? "mixed"),
  );
}

describe("g5–8 Challenge mixed-representation config", () => {
  it("includes whole, fraction, and decimal in the Challenge pool", () => {
    expect([...MIXED_REPRESENTATIONS]).toEqual(["whole", "fraction", "decimal"]);
    expect(Object.keys(G58_CHALLENGE_REPRESENTATION_WEIGHTS).sort()).toEqual([
      "decimal",
      "fraction",
      "whole",
    ]);
  });

  it("locks positive weights that normalize to the documented 3:3:4 mix", () => {
    expect(G58_CHALLENGE_REPRESENTATION_WEIGHTS).toEqual({
      whole: 3,
      fraction: 3,
      decimal: 4,
    });
    const values = Object.values(G58_CHALLENGE_REPRESENTATION_WEIGHTS);
    expect(values.every((weight) => weight > 0)).toBe(true);
    expect(values.reduce((sum, weight) => sum + weight, 0)).toBe(10);
    expect(G58_CHALLENGE_REPRESENTATION_WEIGHTS.whole / 10).toBeCloseTo(0.3, 10);
    expect(G58_CHALLENGE_REPRESENTATION_WEIGHTS.fraction / 10).toBeCloseTo(0.3, 10);
    expect(G58_CHALLENGE_REPRESENTATION_WEIGHTS.decimal / 10).toBeCloseTo(0.4, 10);
  });

  it("enables the mixed pool only for g5–8 Challenge", () => {
    expect(usesMixedChallengePool("g56", "challenge")).toBe(true);
    expect(usesMixedChallengePool("g78", "challenge")).toBe(true);
    expect(usesMixedChallengePool("g56", "guided")).toBe(false);
    expect(usesMixedChallengePool("g78", "guided")).toBe(false);
    expect(usesMixedChallengePool("g12", "challenge")).toBe(false);
    expect(usesMixedChallengePool("g34", "challenge")).toBe(false);
    expect(usesMixedChallengePool("g12", "guided")).toBe(false);
    expect(usesMixedChallengePool("g34", "guided")).toBe(false);
  });
});

describe("g5–8 Challenge mixed selection", () => {
  it("never repeats a representation on consecutive trials", () => {
    for (const band of G58_BANDS) {
      for (let seed = 0; seed < 80; seed += 1) {
        const reps = representationsOf(mixedRound(band, seed + 1000));
        expect(reps).toHaveLength(ROUND_MAX_TRIALS);
        for (let index = 1; index < reps.length; index += 1) {
          expect(reps[index], `${band} seed ${seed} trial ${index}`).not.toBe(reps[index - 1]);
        }
      }
    }
  });

  it("includes all three representations in every standard 10-trial run", () => {
    for (const band of G58_BANDS) {
      for (const seed of MIXED_SEEDS) {
        const kinds = new Set(representationsOf(mixedRound(band, seed)));
        expect(kinds, `${band} seed ${seed}`).toEqual(new Set(MIXED_REPRESENTATIONS));
      }
      for (let seed = 200; seed < 280; seed += 1) {
        const kinds = new Set(representationsOf(mixedRound(band, seed)));
        expect(kinds.size, `${band} seed ${seed}`).toBe(3);
      }
    }
  });

  it("replays the same mixed sequence for the same seed, band, and mode", () => {
    for (const band of G58_BANDS) {
      const a = mixedRound(band, 12345);
      const b = mixedRound(band, 12345);
      expect(a).toEqual(b);
    }
  });

  it("keeps the Challenge interior-intent rhythm on mixed g5–8 rounds", () => {
    for (const band of G58_BANDS) {
      expect(mixedRound(band, 5).map((target) => target.intent)).toEqual(CHALLENGE_TARGET_INTENTS);
    }
  });

  it("diverges across seeds and stays independent of Guided generation", () => {
    const challengeA = mixedRound("g56", 1);
    const challengeB = mixedRound("g56", 2);
    expect(representationsOf(challengeA)).not.toEqual(representationsOf(challengeB));
    const guided = generateRoundTargets("g56", mulberry32(1), ROUND_MAX_TRIALS, "guided");
    expect(challengeA).not.toEqual(guided);
  });

  it("keeps representation-specific target rules on mixed runs", () => {
    for (const band of G58_BANDS) {
      const targets = mixedRound(band, 20260825, 40);
      expect(targets.some((target) => representationOf(target.kind) === "whole")).toBe(true);
      expect(targets.some((target) => target.kind === "fraction")).toBe(true);
      expect(targets.some((target) => target.kind === "decimal")).toBe(true);

      for (const target of targets) {
        expect(target.value).toBeGreaterThanOrEqual(target.range.min);
        expect(target.value).toBeLessThanOrEqual(target.range.max);
        expect(target.display.length).toBeGreaterThan(0);
        expect(target.display).not.toMatch(/NaN|undefined|null/i);

        if (target.kind === "fraction") {
          expect(target.display).toMatch(/\d+\/\d+/);
          const match = target.display.match(/(\d+)\/(\d+)/);
          const numerator = Number(match?.[1]);
          const denominator = Number(match?.[2]);
          expect(numerator).toBeGreaterThan(0);
          expect(denominator).toBeGreaterThan(1);
          for (let divisor = 2; divisor <= Math.min(numerator, denominator); divisor += 1) {
            expect(numerator % divisor === 0 && denominator % divisor === 0).toBe(false);
          }
        }

        if (target.kind === "decimal") {
          const unsigned = target.display.replace(/^−/, "");
          const places = (unsigned.split(".")[1] ?? "").length;
          expect(places).toBeLessThanOrEqual(2);
        }

        if (representationOf(target.kind) === "whole") {
          expect(Number.isInteger(target.value)).toBe(true);
        }
      }
    }
  });

  it("preserves accessible display text for whole, fraction, and decimal targets", () => {
    const targets = [...mixedRound("g56", 42), ...mixedRound("g78", 42)];
    const byRep = {
      whole: targets.filter((target) => representationOf(target.kind) === "whole"),
      fraction: targets.filter((target) => target.kind === "fraction"),
      decimal: targets.filter((target) => target.kind === "decimal"),
    };
    expect(byRep.whole.length).toBeGreaterThan(0);
    expect(byRep.fraction.length).toBeGreaterThan(0);
    expect(byRep.decimal.length).toBeGreaterThan(0);
    for (const target of byRep.whole) {
      expect(target.display).toMatch(/^−?\d+$/);
    }
    for (const target of byRep.fraction) {
      expect(target.display).toMatch(/\d+\/\d+/);
    }
    for (const target of byRep.decimal) {
      expect(target.display).toMatch(/^−?\d+(\.\d+)?$/);
    }
  });
});

describe("mixed-selection weighting sanity", () => {
  it("keeps observed shares near the configured mix without requiring exact percentages", () => {
    const counts: Record<MixedRepresentation, number> = { whole: 0, fraction: 0, decimal: 0 };
    const sampleSeeds = 250;
    for (const band of G58_BANDS) {
      for (let seed = 1; seed <= sampleSeeds; seed += 1) {
        for (const rep of representationsOf(mixedRound(band, seed))) {
          counts[rep] += 1;
        }
      }
    }
    const total = G58_BANDS.length * sampleSeeds * ROUND_MAX_TRIALS;
    // No-repeat + coverage flatten 30/30/40 toward even exposure. Documented
    // tolerance is roughly 20–45% each rather than exact configured shares.
    for (const rep of MIXED_REPRESENTATIONS) {
      const share = counts[rep] / total;
      expect(share, `${rep} share ${share}`).toBeGreaterThan(0.2);
      expect(share, `${rep} share ${share}`).toBeLessThan(0.45);
    }
  });
});

describe("g1–4 mixed-pool regression", () => {
  it("leaves g1–4 Guided and Challenge on the existing generateTarget path", () => {
    for (const band of YOUNGER_BANDS) {
      for (const mode of ["guided", "challenge"] as const) {
        const seed = 77;
        const actual = generateRoundTargets(band, mulberry32(seed), ROUND_MAX_TRIALS, mode);
        const expected = replayWithGenerateTarget(band, seed, mode);
        expect(actual, `${band} ${mode}`).toEqual(expected);
      }
    }
  });

  it("keeps g12 Challenge as whole numbers only", () => {
    const targets = generateRoundTargets("g12", mulberry32(99), 40, "challenge");
    expect(targets.every((target) => target.kind === "whole")).toBe(true);
  });
});

describe("Guided and Explore mixed-pool regression", () => {
  it("does not apply mixed Challenge selection to Guided g5–8 rounds", () => {
    for (const band of G58_BANDS) {
      const seed = 21;
      const actual = generateRoundTargets(band, mulberry32(seed), ROUND_MAX_TRIALS, "guided");
      const expected = replayWithGenerateTarget(band, seed, "guided");
      expect(actual, `${band} guided`).toEqual(expected);
    }
  });

  it("keeps Guided g56 on decimal/fraction generation (no Challenge wholes)", () => {
    const guided = generateRoundTargets("g56", mulberry32(21), 40, "guided");
    expect(guided.every((target) => target.kind === "decimal" || target.kind === "fraction")).toBe(true);
    const challenge = mixedRound("g56", 21, 40);
    expect(challenge.some((target) => target.kind === "whole")).toBe(true);
  });

  it("leaves standalone generateTarget unchanged for Explore-style sampling", () => {
    const rngA = mulberry32(8);
    const rngB = mulberry32(8);
    const a = Array.from({ length: 12 }, () => generateTarget("g56", rngA));
    const b = Array.from({ length: 12 }, () => generateTarget("g56", rngB));
    expect(a).toEqual(b);
    expect(a.every((target) => target.kind === "decimal" || target.kind === "fraction")).toBe(true);
  });
});

describe("strongest representation over mixed runs", () => {
  const range = { min: 0, max: 10 };

  function trial(
    kind: TrialRecord["kind"],
    closeness: TrialRecord["closeness"],
  ): TrialRecord {
    const error = closeness === "exact" ? 0.02 : closeness === "close" ? 0.1 : 0.3;
    const points = closeness === "exact" ? 10 : closeness === "close" ? 6 : 2;
    return { error, closeness, points, kind, range, direction: "low", intent: "interior" };
  }

  it("attributes mixed-run trials to the representation with the best close rate", () => {
    const trials: TrialRecord[] = [
      trial("whole", "exact"),
      trial("whole", "exact"),
      trial("whole", "close"),
      trial("fraction", "far"),
      trial("fraction", "far"),
      trial("fraction", "close"),
      trial("fraction", "far"),
      trial("decimal", "close"),
      trial("decimal", "far"),
      trial("decimal", "close"),
    ];
    const summary = summarizeRound(trials);
    expect(summary.strongestKind).toBe("whole");
    expect(summary.strongestKindCloseRate).toBe(1);
  });

  it("never lets a representation with zero attempts win", () => {
    const trials: TrialRecord[] = [
      trial("fraction", "far"),
      trial("fraction", "close"),
      trial("decimal", "exact"),
      trial("decimal", "exact"),
      trial("decimal", "close"),
    ];
    const summary = summarizeRound(trials);
    expect(summary.strongestKind).toBe("decimal");
    expect(summary.strongestKind).not.toBe("whole");
  });

  it("ignores a perfect single-attempt representation", () => {
    const trials: TrialRecord[] = [
      trial("whole", "exact"),
      trial("fraction", "close"),
      trial("fraction", "close"),
      trial("fraction", "far"),
      trial("decimal", "far"),
      trial("decimal", "far"),
    ];
    const summary = summarizeRound(trials);
    expect(summary.strongestKind).toBe("fraction");
  });

  it("breaks equal close-rate ties by larger sample, then whole < fraction < decimal", () => {
    const sampleTie: TrialRecord[] = [
      trial("fraction", "close"),
      trial("fraction", "close"),
      trial("decimal", "close"),
      trial("decimal", "close"),
      trial("decimal", "close"),
    ];
    expect(summarizeRound(sampleTie).strongestKind).toBe("decimal");

    const orderTie: TrialRecord[] = [
      trial("decimal", "close"),
      trial("decimal", "close"),
      trial("fraction", "close"),
      trial("fraction", "close"),
      trial("whole", "close"),
      trial("whole", "close"),
    ];
    expect(summarizeRound(orderTie).strongestKind).toBe("whole");
  });
});
