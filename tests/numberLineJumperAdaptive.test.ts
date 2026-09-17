import { describe, expect, it } from "vitest";
import {
  ADAPTIVE_DIRECTIONAL_BIAS_THRESHOLD,
  ADAPTIVE_HOT_ZONE_BIAS_STRENGTH,
  ADAPTIVE_HOT_ZONE_MAX_HALF_WIDTH,
  ADAPTIVE_HOT_ZONE_MIN_HALF_WIDTH,
  ADAPTIVE_MIN_DECIMAL_OBSERVATIONS,
  ADAPTIVE_QUOTA_WINDOW_SIZE,
  ADAPTIVE_WEAK_SIDE_TARGET_PROBABILITY,
  analyzeRecentTrials,
  deriveAdaptiveBias,
} from "@/lib/numberLineJumper/adaptive";
import {
  CHALLENGE_TARGET_INTENTS,
  createAdaptiveTargetGeneratorState,
  generateAdaptiveTarget,
  generateRoundTargets,
  mulberry32,
  representationOf,
  ROUND_MAX_TRIALS,
  ROUND_TARGET_INTENTS,
} from "@/lib/numberLineJumper/engine";
import type { AdaptiveSide } from "@/lib/numberLineJumper/adaptive";
import type { PlacementBand, Target, TrialRecord } from "@/lib/numberLineJumper/types";

const BANDS: readonly PlacementBand[] = ["g12", "g34", "g56", "g78"];
const MODES = ["guided", "challenge"] as const;

function trial(
  direction: TrialRecord["direction"],
  overrides: Partial<TrialRecord> = {},
): TrialRecord {
  return {
    completed: true,
    error: 0.2,
    closeness: "far",
    points: 2,
    direction,
    ...overrides,
  };
}

function decimalTrial(targetValue: number, playerValue: number): TrialRecord {
  return trial("low", {
    error: Math.abs(playerValue - targetValue) / 10,
    kind: "decimal",
    range: { min: 0, max: 10 },
    targetValue,
    playerValue,
    intent: "interior",
  });
}

function responseFor(target: Target, direction: AdaptiveSide): TrialRecord {
  const offset = (target.range.max - target.range.min) * 0.1;
  return trial(direction, {
    error: 0.2,
    kind: target.kind,
    range: target.range,
    targetValue: target.value,
    playerValue: target.value + (direction === "high" ? offset : -offset),
    intent: target.intent,
  });
}

function correctResponseFor(target: Target): TrialRecord {
  return trial("spot", {
    error: 0,
    kind: target.kind,
    range: target.range,
    targetValue: target.value,
    playerValue: target.value,
    intent: target.intent,
  });
}

interface ReplayItem {
  target: Target;
  sideBiasApplied: boolean;
  sideBiasApplicable: boolean;
}

function replay(
  seed: number,
  band: PlacementBand,
  mode: (typeof MODES)[number],
  directions: readonly AdaptiveSide[],
  count = ROUND_MAX_TRIALS,
): ReplayItem[] {
  const rng = mulberry32(seed);
  let state = createAdaptiveTargetGeneratorState();
  let completedTrials: TrialRecord[] = [];
  const items: ReplayItem[] = [];
  for (let index = 0; index < count; index += 1) {
    const generated = generateAdaptiveTarget(
      band,
      rng,
      index,
      mode,
      completedTrials,
      state,
      count,
    );
    items.push({
      target: generated.target,
      sideBiasApplied: generated.sideBiasApplied,
      sideBiasApplicable: generated.sideBiasApplicable,
    });
    state = generated.state;
    const direction = directions[index] ?? directions[directions.length - 1];
    if (direction) completedTrials = [...completedTrials, responseFor(generated.target, direction)];
  }
  return items;
}

function replayWithResponsePlan(
  seed: number,
  band: PlacementBand,
  mode: (typeof MODES)[number],
  responsePlan: (target: Target, index: number) => TrialRecord | null,
  count = ROUND_MAX_TRIALS,
): ReplayItem[] {
  const rng = mulberry32(seed);
  let state = createAdaptiveTargetGeneratorState();
  let completedTrials: TrialRecord[] = [];
  const items: ReplayItem[] = [];
  for (let index = 0; index < count; index += 1) {
    const generated = generateAdaptiveTarget(
      band,
      rng,
      index,
      mode,
      completedTrials,
      state,
      count,
    );
    items.push({
      target: generated.target,
      sideBiasApplied: generated.sideBiasApplied,
      sideBiasApplicable: generated.sideBiasApplicable,
    });
    state = generated.state;
    const response = responsePlan(generated.target, index);
    if (response) completedTrials = [...completedTrials, response];
  }
  return items;
}

function targetSignature(target: Target): string {
  return [target.value, target.display, target.kind, target.range.min, target.range.max, target.intent].join("|");
}

function normalizedTarget(target: Target): number {
  return (target.value - target.range.min) / (target.range.max - target.range.min);
}

function sideOfTarget(target: Target): AdaptiveSide | null {
  const normalized = normalizedTarget(target);
  if (normalized < 0.5) return "low";
  if (normalized > 0.5) return "high";
  return null;
}

describe("LEVELBEST-60 adaptive analysis", () => {
  it("keeps only the last three completed trials and drops older evidence", () => {
    const analysis = analyzeRecentTrials([
      trial("low"),
      trial("high"),
      trial("high"),
      trial("high"),
    ]);

    expect(analysis.recentTrials).toHaveLength(3);
    expect(analysis.recentTrials.map((item) => item.direction)).toEqual(["high", "high", "high"]);
    expect(analysis.directionalBias).toBe(1);
  });

  it("ignores incomplete records instead of letting them contaminate the window", () => {
    const analysis = analyzeRecentTrials([
      trial("low"),
      trial("high", { completed: false }),
      trial("high"),
      trial("high"),
    ]);

    expect(analysis.recentTrials.map((item) => item.direction)).toEqual(["low", "high", "high"]);
    expect(analysis.directionalBias).toBeCloseTo(1 / 3, 10);
    expect(deriveAdaptiveBias(analysis).weakSide).toBeNull();
  });

  it("fails closed for empty, sparse, and malformed required history", () => {
    const empty = analyzeRecentTrials([]);
    expect(empty.directionalBias).toBe(0);
    expect(empty.meanRelativeError).toBe(0);
    expect(deriveAdaptiveBias(empty).weakSide).toBeNull();

    const malformed = {
      ...trial("high"),
      error: Number.NaN,
    } as TrialRecord;
    const analysis = analyzeRecentTrials([trial("high"), trial("high"), malformed, null, undefined]);
    expect(analysis.recentTrials).toHaveLength(2);
    expect(analysis.directionalBias).toBe(1);
    expect(analysis.meanRelativeError).toBeCloseTo(0.2, 10);
    expect(deriveAdaptiveBias(analysis).weakSide).toBeNull();
  });

  it("ignores malformed optional decimal fields without throwing or creating a hot-zone", () => {
    const malformedDecimal = trial("high", {
      kind: "decimal",
      range: null as unknown as TrialRecord["range"],
      targetValue: 7,
      playerValue: 6,
    });
    expect(() => analyzeRecentTrials([trial("high"), trial("high"), malformedDecimal])).not.toThrow();
    expect(analyzeRecentTrials([trial("high"), trial("high"), malformedDecimal]).hotZone).toBeNull();
  });

  it("locks below, exact, and above threshold behavior to strict greater-than", () => {
    const below = deriveAdaptiveBias([trial("high"), trial("low"), trial("spot")]);
    const exact = deriveAdaptiveBias([trial("high"), trial("high"), trial("low")]);
    const above = deriveAdaptiveBias([trial("high"), trial("high"), trial("spot")]);

    expect(ADAPTIVE_DIRECTIONAL_BIAS_THRESHOLD).toBe(1 / 3);
    expect(below.directionalBias).toBe(0);
    expect(below.weakSide).toBeNull();
    expect(exact.directionalBias).toBe(ADAPTIVE_DIRECTIONAL_BIAS_THRESHOLD);
    expect(exact.weakSide).toBeNull();
    expect(above.directionalBias).toBeGreaterThan(ADAPTIVE_DIRECTIONAL_BIAS_THRESHOLD);
    expect(above.weakSide).toBe("high");
  });

  it("derives the mean relative error and a normalized decimal error hot-zone", () => {
    const analysis = analyzeRecentTrials([
      decimalTrial(7, 6),
      decimalTrial(8, 7),
      trial("spot", { kind: "whole" }),
    ]);

    expect(analysis.meanRelativeError).toBeCloseTo((0.1 + 0.1 + 0.2) / 3, 10);
    expect(analysis.hotZone).not.toBeNull();
    expect(analysis.hotZone?.center).toBeCloseTo(0.7, 10);
    expect(analysis.hotZone?.min).toBeCloseTo(0.55, 10);
    expect(analysis.hotZone?.max).toBeCloseTo(0.85, 10);
    expect(ADAPTIVE_MIN_DECIMAL_OBSERVATIONS).toBe(2);
    expect(ADAPTIVE_HOT_ZONE_MIN_HALF_WIDTH).toBeLessThanOrEqual(ADAPTIVE_HOT_ZONE_MAX_HALF_WIDTH);
    expect(analyzeRecentTrials([decimalTrial(7, 6), trial("spot")]).hotZone).toBeNull();
  });
});

describe("LEVELBEST-60 adaptive target generation", () => {
  it("matches the baseline target sequence until adaptation has evidence", () => {
    for (const band of BANDS) {
      for (const mode of MODES) {
        const baseline = generateRoundTargets(band, mulberry32(20260903), ROUND_MAX_TRIALS, mode);
        const actual = replay(20260903, band, mode, [], ROUND_MAX_TRIALS).map((item) => item.target);
        expect(actual, `${band} ${mode}`).toEqual(baseline);
      }
    }
  });

  it("keeps the authored intent rhythm, bounds, and mixed-representation guarantees", () => {
    const guided = replay(73, "g12", "guided", Array(10).fill("high"), 10).map((item) => item.target);
    expect(guided.map((target) => target.intent)).toEqual(ROUND_TARGET_INTENTS);
    expect(guided.filter((target) => target.intent === "interior")).toHaveLength(4);
    for (const target of guided) {
      expect(target.value).toBeGreaterThanOrEqual(target.range.min);
      expect(target.value).toBeLessThanOrEqual(target.range.max);
    }

    const mixed = replay(73, "g56", "challenge", Array(10).fill("high"), 10).map((item) => item.target);
    expect(mixed.map((target) => target.intent)).toEqual(CHALLENGE_TARGET_INTENTS);
    expect(new Set(mixed.map((target) => representationOf(target.kind))).size).toBe(3);
    for (let index = 1; index < mixed.length; index += 1) {
      expect(representationOf(mixed[index]!.kind)).not.toBe(representationOf(mixed[index - 1]!.kind));
    }
    for (const target of mixed) {
      expect(target.value).toBeGreaterThanOrEqual(target.range.min);
      expect(target.value).toBeLessThanOrEqual(target.range.max);
    }

    const mixedNegative = replay(20260903, "g78", "challenge", Array(10).fill("high"), 10).map((item) => item.target);
    for (const target of mixedNegative) {
      if (target.kind === "fraction") expect(target.display).toMatch(/^−?\d+(?: \d+)?\/\d+$/);
      if (target.kind === "decimal") expect(target.display).toMatch(/^−?\d+(?:\.\d+)?$/);
      expect(target.value).toBeGreaterThanOrEqual(target.range.min);
      expect(target.value).toBeLessThanOrEqual(target.range.max);
    }
  });

  it("activates a high-side policy without turning the line into a one-sided generator", () => {
    const items = replay(41, "g12", "guided", Array(40).fill("high"), 40);
    const applicable = items.slice(3).filter((item) => item.sideBiasApplicable);
    const biased = applicable.filter((item) => item.sideBiasApplied);
    const highTargets = items.slice(3).filter((item) => sideOfTarget(item.target) === "high");
    const lowTargets = items.slice(3).filter((item) => sideOfTarget(item.target) === "low");

    expect(applicable.length).toBeGreaterThanOrEqual(ADAPTIVE_QUOTA_WINDOW_SIZE);
    expect(biased.length / applicable.length).toBeGreaterThanOrEqual(ADAPTIVE_WEAK_SIDE_TARGET_PROBABILITY);
    expect(highTargets.length).toBeGreaterThan(0);
    expect(lowTargets.length).toBeGreaterThan(0);
  });

  it("mirrors the same bounded policy for low-side responses", () => {
    const items = replay(41, "g12", "guided", Array(20).fill("low"), 20);
    const biased = items.slice(3).filter((item) => item.sideBiasApplied);

    expect(biased.length).toBeGreaterThan(0);
    expect(biased.every((item) => sideOfTarget(item.target) === "low")).toBe(true);
  });

  it("keeps exact correct responses neutral and does not introduce side jumps", () => {
    const items = replayWithResponsePlan(20260906, "g12", "guided", (target) => correctResponseFor(target), 20);
    expect(items.slice(3).every((item) => !item.sideBiasApplicable)).toBe(true);
    expect(items.slice(3).every((item) => !item.sideBiasApplied)).toBe(true);
  });

  it("keeps hint/remediation metadata policy-neutral because GAME-6 does not define it as a signal", () => {
    const plainHistory = [trial("high"), trial("high"), trial("spot")];
    const annotatedHistory = plainHistory.map((record) => ({
      ...record,
      hintUsed: true,
      remediationApplied: true,
    })) as unknown as TrialRecord[];
    const plain = generateAdaptiveTarget(
      "g12",
      mulberry32(991),
      3,
      "guided",
      plainHistory,
      createAdaptiveTargetGeneratorState(),
      10,
    );
    const annotated = generateAdaptiveTarget(
      "g12",
      mulberry32(991),
      3,
      "guided",
      annotatedHistory,
      createAdaptiveTargetGeneratorState(),
      10,
    );
    expect(targetSignature(annotated.target)).toBe(targetSignature(plain.target));
    expect(annotated.bias).toEqual(plain.bias);
  });

  it("replays exactly for the same seed and response sequence, and diverges for changed responses", () => {
    const high = replay(20260903, "g12", "guided", Array(20).fill("high"), 20).map((item) => targetSignature(item.target));
    const highAgain = replay(20260903, "g12", "guided", Array(20).fill("high"), 20).map((item) => targetSignature(item.target));
    const low = replay(20260903, "g12", "guided", Array(20).fill("low"), 20).map((item) => targetSignature(item.target));

    expect(highAgain).toEqual(high);
    expect(low).not.toEqual(high);
    expect(low.slice(0, 3)).toEqual(high.slice(0, 3));
  });

  it("keeps both sides reachable across bands and modes during a long repeated-error run", () => {
    for (const band of BANDS) {
      for (const mode of MODES) {
        const items = replay(41, band, mode, Array(40).fill("high"), 40);
        const sides = new Set(
          items.map((item) => sideOfTarget(item.target)).filter((side): side is AdaptiveSide => side !== null),
        );
        expect(sides, `${band} ${mode}`).toEqual(new Set(["low", "high"]));
      }
    }
  });

  it("holds grade-band bounds at the PRNG extremes", () => {
    for (const rngValue of [0, 0.999999]) {
      for (const band of BANDS) {
        for (const mode of MODES) {
          let state = createAdaptiveTargetGeneratorState();
          for (let index = 0; index < ROUND_MAX_TRIALS; index += 1) {
            const generated = generateAdaptiveTarget(
              band,
              () => rngValue,
              index,
              mode,
              [trial("low"), trial("low"), trial("low")],
              state,
              ROUND_MAX_TRIALS,
            );
            state = generated.state;
            expect(Number.isFinite(generated.target.value), `${band} ${mode} ${rngValue}`).toBe(true);
            expect(generated.target.value).toBeGreaterThanOrEqual(generated.target.range.min);
            expect(generated.target.value).toBeLessThanOrEqual(generated.target.range.max);
          }
        }
      }
    }
  });

  it("shifts decimal selection toward the observed hot-zone without excluding the rest", () => {
    const evidence = [decimalTrial(7, 6), decimalTrial(8, 7)];
    const zone = analyzeRecentTrials(evidence).hotZone!;
    let baselineInZone = 0;
    let baselineDecimals = 0;
    let adaptedInZone = 0;
    let adaptedDecimals = 0;
    let adaptedOutsideZone = 0;

    for (let seed = 1; seed <= 120; seed += 1) {
      const baseline = generateRoundTargets("g56", mulberry32(seed), 10, "guided");
      for (const target of baseline) {
        if (target.kind !== "decimal") continue;
        baselineDecimals += 1;
        if (normalizedTarget(target) >= zone.min && normalizedTarget(target) <= zone.max) baselineInZone += 1;
      }

      const rng = mulberry32(seed);
      let state = createAdaptiveTargetGeneratorState();
      for (let index = 0; index < 10; index += 1) {
        const generated = generateAdaptiveTarget("g56", rng, index, "guided", evidence, state, 10);
        state = generated.state;
        const target = generated.target;
        if (target.kind !== "decimal") continue;
        adaptedDecimals += 1;
        const inZone = normalizedTarget(target) >= zone.min && normalizedTarget(target) <= zone.max;
        if (inZone) adaptedInZone += 1;
        else adaptedOutsideZone += 1;
      }
    }

    const baselineRate = baselineInZone / baselineDecimals;
    const adaptedRate = adaptedInZone / adaptedDecimals;
    expect(adaptedRate).toBeGreaterThan(baselineRate + 0.05);
    expect(adaptedOutsideZone).toBeGreaterThan(0);
    expect(ADAPTIVE_HOT_ZONE_BIAS_STRENGTH).toBe(0.35);
  });
});
