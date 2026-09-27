import { describe, expect, it } from "vitest";
import {
  createAdaptiveTargetGeneratorState,
  generateAdaptiveTarget,
  generateRoundTargets,
  generateTarget,
  mulberry32,
} from "@/lib/numberLineJumper/engine";
import {
  NUMBER_LINE_JUMPER_SKILLS,
  skillForTarget,
  skillsForTarget,
} from "@/lib/numberLineJumper/skills";
import type { PlacementBand, Target, TrialRecord } from "@/lib/numberLineJumper/types";

const BANDS: readonly PlacementBand[] = ["g12", "g34", "g56", "g78"];
const MODES = ["guided", "challenge"] as const;

function observedTargets(): Map<string, Target> {
  const observed = new Map<string, Target>();
  for (const band of BANDS) {
    for (let seed = 1; seed <= 512; seed += 1) {
      for (const intent of ["anchor", "interior", "midpoint", "contrast", "mixed"] as const) {
        const target = generateTarget(band, mulberry32(seed * 101 + intent.length), intent);
        observed.set(`${band}/${target.kind}/${target.range.min}-${target.range.max}`, target);
      }
      for (const mode of MODES) {
        for (const target of generateRoundTargets(band, mulberry32(seed * 1009), 10, mode)) {
          observed.set(`${band}/${target.kind}/${target.range.min}-${target.range.max}`, target);
        }

        let state = createAdaptiveTargetGeneratorState();
        const trials: TrialRecord[] = [
          {
            completed: true,
            error: 0.8,
            closeness: "far",
            points: 2,
            direction: "high",
            kind: "decimal",
            range: { min: 0, max: 1 },
          },
          {
            completed: true,
            error: 0.8,
            closeness: "far",
            points: 2,
            direction: "high",
            kind: "decimal",
            range: { min: 0, max: 1 },
          },
          {
            completed: true,
            error: 0.8,
            closeness: "far",
            points: 2,
            direction: "high",
            kind: "decimal",
            range: { min: 0, max: 1 },
          },
        ];
        for (let index = 0; index < 10; index += 1) {
          const generated = generateAdaptiveTarget(
            band,
            mulberry32(seed * 2027 + index),
            index,
            mode,
            trials,
            state,
            10,
          );
          observed.set(`${band}/${generated.target.kind}/${generated.target.range.min}-${generated.target.range.max}`, generated.target);
          state = generated.state;
        }
      }
    }
  }
  return observed;
}

describe("Number Line Jumper curriculum registry", () => {
  it("has one row per unique band and representation focus", () => {
    const keys = NUMBER_LINE_JUMPER_SKILLS.map((skill) => `${skill.band}/${skill.representation}`);
    expect(new Set(keys).size).toBe(keys.length);
    expect(NUMBER_LINE_JUMPER_SKILLS).toHaveLength(10);
  });

  it("maps every observed target from direct, round, and adaptive generators exactly once", () => {
    for (const [observedKey, target] of observedTargets()) {
      const band = observedKey.split("/")[0] as PlacementBand;
      expect(skillsForTarget(band, target), observedKey).toHaveLength(1);
      expect(skillForTarget(band, target), observedKey).toBe(skillsForTarget(band, target)[0]);
    }
  });

  it("reaches every registry row through the real generators", () => {
    const observed = observedTargets();
    for (const skill of NUMBER_LINE_JUMPER_SKILLS) {
      const reachable = [...observed.entries()].some(([observedKey, target]) =>
        observedKey.startsWith(`${skill.band}/`)
          && skillForTarget(skill.band, target).id === skill.id,
      );
      expect(reachable, `${skill.id} is unreachable`).toBe(true);
    }
  });

  it("fails closed when a band, kind, or range has no curriculum row", () => {
    const unsupported: Target = {
      value: 0.5,
      display: "0.5",
      kind: "decimal",
      range: { min: 0, max: 2 },
    };
    expect(skillsForTarget("g12", unsupported)).toEqual([]);
    expect(() => skillForTarget("g12", unsupported)).toThrow(/exactly one/);
  });
});
