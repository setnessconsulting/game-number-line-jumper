import { describe, expect, it } from "vitest";
import {
  ALL_BANDS,
  ariaValueText,
  BAND_META,
  CHALLENGE_TARGET_INTENTS,
  formatFraction,
  G34_IMPROPER_FRACTION_SHARE,
  generateRoundTargets,
  generateTarget,
  mulberry32,
  rangesForBand,
  rangesForFraction,
  valueAtPosition,
  targetRevealAnnouncement,
  ROUND_MAX_TRIALS,
  ROUND_SECONDS,
  scorePlacement,
  summarizeRound,
} from "@/lib/numberLineJumper/engine";
import type { PlacementBand, Target, TrialRecord } from "@/lib/numberLineJumper/types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function targetsFor(band: PlacementBand, seed: number, count: number): Target[] {
  const rng = mulberry32(seed);
  return Array.from({ length: count }, () => generateTarget(band, rng));
}

function normOnRange(value: number, min: number, max: number): number {
  if (max === min) return 0;
  return (value - min) / (max - min);
}

function fractionParts(display: string): { numerator: number; denominator: number } | null {
  const mixed = display.match(/^(\d+) (\d+)\/(\d+)$/);
  if (mixed) {
    return {
      numerator: Number(mixed[1]) * Number(mixed[3]) + Number(mixed[2]),
      denominator: Number(mixed[3]),
    };
  }
  const improperOrProper = display.match(/^(\d+)\/(\d+)$/);
  return improperOrProper
    ? { numerator: Number(improperOrProper[1]), denominator: Number(improperOrProper[2]) }
    : null;
}

function expectReduced(numerator: number, denominator: number): void {
  for (let divisor = 2; divisor <= Math.min(numerator, denominator); divisor += 1) {
    expect(numerator % divisor === 0 && denominator % divisor === 0).toBe(false);
  }
}

// ---------------------------------------------------------------------------
// Constants & meta
// ---------------------------------------------------------------------------

describe("numberLineJumper constants", () => {
  it("exposes the four placement bands", () => {
    expect(ALL_BANDS).toEqual(["g12", "g34", "g56", "g78"]);
  });

  it("has labels for every band", () => {
    for (const band of ALL_BANDS) {
      expect(BAND_META[band].label.length).toBeGreaterThan(0);
      expect(BAND_META[band].detail.length).toBeGreaterThan(0);
    }
  });

  it("uses the design-brief session limits", () => {
    expect(ROUND_SECONDS).toBe(60);
    expect(ROUND_MAX_TRIALS).toBe(10);
  });
});

// ---------------------------------------------------------------------------
// Determinism
// ---------------------------------------------------------------------------

describe("determinism", () => {
  it("identical seed + band yields identical target sequence", () => {
    const a = targetsFor("g34", 42, 20);
    const b = targetsFor("g34", 42, 20);
    expect(a.map((t) => t.display)).toEqual(b.map((t) => t.display));
    expect(a.map((t) => t.value)).toEqual(b.map((t) => t.value));
  });

  it("different seeds diverge", () => {
    const a = targetsFor("g12", 1, 10).map((t) => t.value);
    const b = targetsFor("g12", 2, 10).map((t) => t.value);
    expect(a).not.toEqual(b);
  });

  it("structured rounds replay the same authored intent rhythm", () => {
    const a = generateRoundTargets("g56", mulberry32(20260825));
    const b = generateRoundTargets("g56", mulberry32(20260825));
    expect(a).toEqual(b);
    expect(a).toHaveLength(ROUND_MAX_TRIALS);
    expect(a.every((target) => target.intent)).toBe(true);
  });

  it("challenge rounds use a more interior intent rhythm", () => {
    const targets = generateRoundTargets("g12", mulberry32(20260825), ROUND_MAX_TRIALS, "challenge");
    expect(targets.map((target) => target.intent)).toEqual(CHALLENGE_TARGET_INTENTS);
    expect(targets.some((target) => target.intent === "anchor")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Target generation by band
// ---------------------------------------------------------------------------

describe("generateTarget — g12 (wholes)", () => {
  it("stays inside declared ranges", () => {
    const targets = targetsFor("g12", 99, 40);
    for (const t of targets) {
      expect(t.value).toBeGreaterThanOrEqual(t.range.min);
      expect(t.value).toBeLessThanOrEqual(t.range.max);
      expect(t.kind).toBe("whole");
      expect(Number.isInteger(t.value)).toBe(true);
    }
  });

  it("uses only the three design ranges", () => {
    const ranges = new Set(
      targetsFor("g12", 7, 60).map((t) => `${t.range.min}-${t.range.max}`),
    );
    expect([...ranges].sort()).toEqual(["0-10", "0-100", "0-20"]);
  });
});

describe("generateTarget — g34 (fractions + wholes)", () => {
  it("produces values inside 0–1 or 0–2", () => {
    for (const t of targetsFor("g34", 11, 50)) {
      expect(t.value).toBeGreaterThanOrEqual(t.range.min);
      expect(t.value).toBeLessThanOrEqual(t.range.max);
      expect(t.range.max).toBeLessThanOrEqual(2);
    }
  });

  it("emits simplified proper and improper fraction displays", () => {
    const fractions = targetsFor("g34", 13, 80).filter((t) => t.kind === "fraction");
    expect(fractions.length).toBeGreaterThan(10);
    expect(fractions.some((target) => (fractionParts(target.display)?.numerator ?? 0) > (fractionParts(target.display)?.denominator ?? 1))).toBe(true);
    for (const t of fractions) {
      expect(t.display).toMatch(/^\d+\/\d+$/);
      const parts = fractionParts(t.display);
      expect(parts).not.toBeNull();
      expectReduced(parts!.numerator, parts!.denominator);
      // Value matches display.
      expect(Math.abs(t.value - parts!.numerator / parts!.denominator)).toBeLessThan(1e-9);
    }
  });
});

describe("generateTarget — g56 (decimals + fractions)", () => {
  it("keeps decimals on the original ranges and fractions on the extended pool", () => {
    for (const t of targetsFor("g56", 21, 40)) {
      expect(t.value).toBeGreaterThanOrEqual(0);
      expect(t.value).toBeLessThanOrEqual(10);
      expect(["decimal", "fraction"]).toContain(t.kind);
      expect(t.range.min).toBe(0);
      expect(t.kind === "fraction" ? [1, 2, 3, 10] : [1, 10]).toContain(t.range.max);
    }
  });

  it("adds 0–2 and 0–3 only to fraction generation", () => {
    expect(rangesForBand("g56")).toEqual([{ min: 0, max: 1 }, { min: 0, max: 10 }]);
    expect(rangesForFraction("g12")).toEqual(rangesForBand("g12"));
    expect(rangesForFraction("g56")).toEqual([
      { min: 0, max: 1 },
      { min: 0, max: 10 },
      { min: 0, max: 2 },
      { min: 0, max: 3 },
    ]);

    const fractions = targetsFor("g56", 20260903, 600).filter((target) => target.kind === "fraction");
    expect(fractions.some((target) => target.range.max === 2 && /^\d+ \d+\/\d+$/.test(target.display))).toBe(true);
    expect(fractions.some((target) => target.range.max === 3 && /^\d+ \d+\/\d+$/.test(target.display))).toBe(true);
    for (const target of fractions) {
      const parts = fractionParts(target.display);
      expect(parts).not.toBeNull();
      expectReduced(parts!.numerator, parts!.denominator);
      expect(target.value).toBeGreaterThanOrEqual(target.range.min);
      expect(target.value).toBeLessThanOrEqual(target.range.max);
    }
  });

  it("decimal displays have at most two places", () => {
    const decimals = targetsFor("g56", 23, 60).filter((t) => t.kind === "decimal");
    expect(decimals.length).toBeGreaterThan(5);
    for (const t of decimals) {
      const places = (t.display.split(".")[1] ?? "").length;
      expect(places).toBeLessThanOrEqual(2);
    }
  });

  it("keeps larger fraction displays readable as mixed numbers", () => {
    const fractions = targetsFor("g56", 20260825, 240).filter((t) => t.kind === "fraction");
    expect(fractions.length).toBeGreaterThan(10);
    expect(fractions.some((target) => /^\d+ \d+\/\d+$/.test(target.display))).toBe(true);
  });
});

describe("LEVELBEST-63 fraction frequency and accessible representation", () => {
  it("keeps the configured g3–4 improper share above the acceptance floor", () => {
    expect(G34_IMPROPER_FRACTION_SHARE).toBe(0.5);
    const fractions = Array.from({ length: 10_000 }, (_, seed) => generateTarget("g34", mulberry32(900_000 + seed)))
      .filter((target) => target.kind === "fraction");
    const improper = fractions.filter((target) => {
      const parts = fractionParts(target.display);
      return parts !== null && parts.numerator > parts.denominator;
    });

    expect(fractions.length).toBeGreaterThan(1_000);
    expect(improper.every((target) => target.range.min === 0 && target.range.max === 2)).toBe(true);
    expect(improper.length / fractions.length).toBeGreaterThanOrEqual(0.22);
  });

  it("shares one reduced formatter and readable announcement paths", () => {
    const improper = formatFraction(14, 10, "improper");
    const mixed = formatFraction(14, 10, "mixed");
    expect(improper).toEqual({ display: "7/5", value: 1.4, isWhole: false });
    expect(mixed).toEqual({ display: "1 2/5", value: 1.4, isWhole: false });

    const range = { min: 0, max: 2 };
    const improperTarget: Target = { value: improper.value, display: improper.display, kind: "fraction", range, intent: "interior" };
    const mixedTarget: Target = { value: mixed.value, display: mixed.display, kind: "fraction", range, intent: "interior" };
    expect(targetRevealAnnouncement(improperTarget)).toContain("7/5");
    expect(targetRevealAnnouncement(mixedTarget)).toContain("1 2/5");
    expect(ariaValueText(0.7, range)).toBe("1.4 on a line from 0 to 2");
  });
});

describe("generateTarget — g78 (negatives + large)", () => {
  it("can produce negative values on the −10…10 range", () => {
    const targets = targetsFor("g78", 31, 80);
    const negatives = targets.filter((t) => t.value < 0);
    expect(negatives.length).toBeGreaterThan(0);
    for (const t of negatives) {
      expect(t.display.startsWith("−")).toBe(true);
      expect(t.range.min).toBe(-10);
      expect(t.range.max).toBe(10);
    }
  });

  it("can produce values on the 0–1000 range", () => {
    const large = targetsFor("g78", 33, 80).filter((t) => t.range.max === 1000);
    expect(large.length).toBeGreaterThan(0);
    for (const t of large) {
      expect(t.value).toBeGreaterThanOrEqual(0);
      expect(t.value).toBeLessThanOrEqual(1000);
    }
  });

  it("includes mixed representations on the negative range", () => {
    const targets = targetsFor("g78", 73, 180).filter((t) => t.range.min === -10);
    expect(targets.some((t) => t.kind === "fraction")).toBe(true);
    expect(targets.some((t) => t.kind === "decimal")).toBe(true);
    expect(targets.some((t) => t.kind === "negative")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

describe("scorePlacement", () => {
  const unitRangeTarget: Target = {
    value: 0.5,
    display: "1/2",
    kind: "fraction",
    range: { min: 0, max: 1 },
  };

  it("awards full points for ≤ 5 % error (exact)", () => {
    // Player at 0.52 → error 0.02
    const s = scorePlacement(0.52, unitRangeTarget);
    expect(s.closeness).toBe("exact");
    expect(s.points).toBe(10);
    expect(s.error).toBeCloseTo(0.02, 5);
  });

  it("awards partial points for ≤ 15 % error (close)", () => {
    // Player at 0.62 → error 0.12
    const s = scorePlacement(0.62, unitRangeTarget);
    expect(s.closeness).toBe("close");
    expect(s.points).toBe(6);
  });

  it("awards low points for > 15 % error (far)", () => {
    const s = scorePlacement(0.9, unitRangeTarget);
    expect(s.closeness).toBe("far");
    expect(s.points).toBe(2);
    expect(s.error).toBeCloseTo(0.4, 5);
  });

  it("reports direction correctly", () => {
    expect(scorePlacement(0.3, unitRangeTarget).direction).toBe("low");
    expect(scorePlacement(0.7, unitRangeTarget).direction).toBe("high");
    expect(scorePlacement(0.5, unitRangeTarget).direction).toBe("spot");
  });

  it("returns values needed for instructional feedback", () => {
    const score = scorePlacement(0.7, unitRangeTarget);
    expect(score.playerValue).toBeCloseTo(0.7, 5);
    expect(score.targetValue).toBe(0.5);
    expect(score.playerNormalized).toBe(0.7);
    expect(score.targetNormalized).toBe(0.5);
    expect(score.feedback).toContain("right of the target");
    expect(score.absoluteError).toBeCloseTo(0.2, 5);
    expect(score.nextStep).toContain("midpoint");
  });

  it("explains direction for far landings too", () => {
    expect(scorePlacement(0, unitRangeTarget).feedback).toContain("left of the target");
    expect(scorePlacement(1, unitRangeTarget).feedback).toContain("right of the target");
  });

  it("clamps extreme player positions to the line ends", () => {
    const low = scorePlacement(-0.5, unitRangeTarget);
    const high = scorePlacement(1.5, unitRangeTarget);
    expect(low.error).toBeCloseTo(0.5, 5); // player treated as 0
    expect(high.error).toBeCloseTo(0.5, 5); // player treated as 1
  });

  it("works on a large whole-number range", () => {
    const t: Target = {
      value: 250,
      display: "250",
      kind: "whole",
      range: { min: 0, max: 1000 },
    };
    // 40 units off → error 0.04 → exact
    const s = scorePlacement(normOnRange(290, 0, 1000), t);
    expect(s.closeness).toBe("exact");
    expect(s.points).toBe(10);
  });

  it.each([
    { value: 173, anchors: "100 and 200" },
    { value: 514, anchors: "500 and 600" },
    { value: 500, anchors: "400 and 600" },
  ])("gives concrete nearby anchors for a large whole target at $value", ({ value, anchors }) => {
    const target: Target = {
      value,
      display: String(value),
      kind: "whole",
      range: { min: 0, max: 1000 },
    };

    const nextStep = scorePlacement(normOnRange(value, 0, 1000), target).nextStep;

    expect(nextStep).toContain(anchors);
    expect(nextStep).toContain("estimate between them");
    expect(nextStep).not.toContain("next hundred or thousand");
    expect(nextStep).not.toContain(String(value));
  });

  it("keeps representation-specific coaching for fractions and decimals", () => {
    const fraction: Target = {
      value: 1.4,
      display: "1 2/5",
      kind: "fraction",
      range: { min: 0, max: 2 },
    };
    const decimal: Target = {
      value: 514.2,
      display: "514.2",
      kind: "decimal",
      range: { min: 0, max: 1000 },
    };

    expect(scorePlacement(normOnRange(fraction.value, 0, 2), fraction).nextStep).toContain("denominator parts");
    expect(scorePlacement(normOnRange(decimal.value, 0, 1000), decimal).nextStep).toContain("use tenths or hundredths");
  });

  it("uses the target's actual side of zero after either a low or high estimate", () => {
    const negative: Target = {
      value: -4,
      display: "−4",
      kind: "negative",
      range: { min: -10, max: 10 },
    };
    const positive: Target = {
      value: 4,
      display: "4",
      kind: "whole",
      range: { min: -10, max: 10 },
    };

    const negativeOvershoot = scorePlacement(normOnRange(-2, -10, 10), negative);
    const positiveUndershoot = scorePlacement(normOnRange(2, -10, 10), positive);

    expect(negativeOvershoot.direction).toBe("high");
    expect(negativeOvershoot.nextStep).toContain("negative-side marks");
    expect(negativeOvershoot.nextStep).not.toContain("positive-side");
    expect(positiveUndershoot.direction).toBe("low");
    expect(positiveUndershoot.nextStep).toContain("positive-side marks");
    expect(positiveUndershoot.nextStep).not.toContain("negative-side");
  });

  it("keeps concrete anchors when a mixed Challenge round emits a whole target", () => {
    const mixedTarget: Target = {
      value: 514,
      display: "514",
      kind: "whole",
      intent: "mixed",
      range: { min: 0, max: 1000 },
    };

    expect(scorePlacement(normOnRange(514, 0, 1000), mixedTarget).nextStep).toContain("500 and 600");
  });

  it("works with negative ranges", () => {
    const t: Target = {
      value: -4,
      display: "−4",
      kind: "negative",
      range: { min: -10, max: 10 },
    };
    // Player at −5 → error 1/20 = 0.05 → exact boundary
    const s = scorePlacement(normOnRange(-5, -10, 10), t);
    expect(s.error).toBeCloseTo(0.05, 5);
    expect(s.closeness).toBe("exact");
  });

  it("never returns empty feedback", () => {
    for (const norm of [0, 0.25, 0.5, 0.75, 1]) {
      const s = scorePlacement(norm, unitRangeTarget);
      expect(s.feedback.length).toBeGreaterThan(0);
    }
  });

  it("maps normalized positions back to the represented value", () => {
    expect(valueAtPosition(0.25, { min: -10, max: 10 })).toBe(-5);
    expect(valueAtPosition(0.5, { min: 0, max: 1000 })).toBe(500);
    expect(valueAtPosition(-1, { min: 0, max: 1 })).toBe(0);
    expect(valueAtPosition(2, { min: 0, max: 1 })).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Round summary
// ---------------------------------------------------------------------------

describe("summarizeRound", () => {
  it("handles an empty round", () => {
    const s = summarizeRound([]);
    expect(s.trials).toBe(0);
    expect(s.totalPoints).toBe(0);
    expect(s.coaching.length).toBeGreaterThan(0);
  });

  it("computes average error, close count, and best streak", () => {
    const trials: TrialRecord[] = [
      { error: 0.02, closeness: "exact", points: 10 },
      { error: 0.1, closeness: "close", points: 6 },
      { error: 0.3, closeness: "far", points: 2 },
      { error: 0.04, closeness: "exact", points: 10 },
      { error: 0.08, closeness: "close", points: 6 },
    ];
    const s = summarizeRound(trials);
    expect(s.trials).toBe(5);
    expect(s.totalPoints).toBe(34);
    expect(s.closeCount).toBe(4);
    expect(s.bestStreak).toBe(2); // last two are close/exact after a far break
    expect(s.averageError).toBeCloseTo((0.02 + 0.1 + 0.3 + 0.04 + 0.08) / 5, 5);
    expect(s.coaching.length).toBeGreaterThan(10);
  });

  it("tracks a long unbroken close streak", () => {
    const trials: TrialRecord[] = Array.from({ length: 6 }, () => ({
      error: 0.03,
      closeness: "exact" as const,
      points: 10,
    }));
    const s = summarizeRound(trials);
    expect(s.bestStreak).toBe(6);
    expect(s.closeCount).toBe(6);
  });

  it("coaching is deterministic for the same stats", () => {
    const trials: TrialRecord[] = [
      { error: 0.2, closeness: "far", points: 2 },
      { error: 0.25, closeness: "far", points: 2 },
    ];
    expect(summarizeRound(trials).coaching).toBe(summarizeRound(trials).coaching);
  });

  it("summarizes direction, progress, and representation patterns in session memory", () => {
    const range = { min: 0, max: 10 };
    const trials: TrialRecord[] = [
      { error: 0.3, closeness: "far", points: 2, direction: "high", kind: "whole", range, intent: "interior" },
      { error: 0.28, closeness: "far", points: 2, direction: "low", kind: "whole", range, intent: "midpoint" },
      { error: 0.03, closeness: "exact", points: 10, direction: "low", kind: "whole", range, intent: "midpoint" },
      { error: 0.02, closeness: "exact", points: 10, direction: "low", kind: "whole", range, intent: "midpoint" },
      { error: 0.01, closeness: "exact", points: 10, direction: "low", kind: "whole", range, intent: "anchor" },
    ];
    const summary = summarizeRound(trials);
    expect(summary.directionBias).toBe("low");
    expect(summary.trend).toBe("improving");
    expect(summary.lastThreeAverageError).toBeCloseTo(0.02, 5);
    expect(summary.strongestKind).toBe("whole");
    expect(summary.strongestKindCloseRate).toBe(0.6);
    expect(summary.strongestRange).toEqual(range);
    expect(summary.midpointCloseRate).toBeCloseTo(2 / 3, 5);
  });
});

// ---------------------------------------------------------------------------
// Integration-style: full seed replay
// ---------------------------------------------------------------------------

describe("seeded session replay", () => {
  it("can drive a full 10-trial round deterministically", () => {
    const rng = mulberry32(20260824);
    const trials: TrialRecord[] = [];
    for (let i = 0; i < ROUND_MAX_TRIALS; i += 1) {
      const target = generateTarget("g34", rng);
      // Simulate a player who is consistently a little high.
      const playerNorm = normOnRange(target.value, target.range.min, target.range.max) + 0.08;
      const score = scorePlacement(playerNorm, target);
      trials.push({
        error: score.error,
        closeness: score.closeness,
        points: score.points,
      });
    }
    const summary = summarizeRound(trials);
    expect(summary.trials).toBe(10);
    expect(summary.totalPoints).toBeGreaterThan(0);
    // Same seed again → identical summary.
    const rng2 = mulberry32(20260824);
    const trials2: TrialRecord[] = [];
    for (let i = 0; i < ROUND_MAX_TRIALS; i += 1) {
      const target = generateTarget("g34", rng2);
      const playerNorm = normOnRange(target.value, target.range.min, target.range.max) + 0.08;
      const score = scorePlacement(playerNorm, target);
      trials2.push({
        error: score.error,
        closeness: score.closeness,
        points: score.points,
      });
    }
    expect(summarizeRound(trials2)).toEqual(summary);
  });
});
