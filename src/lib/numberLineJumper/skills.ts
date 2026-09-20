import type { NumberKind, PlacementBand, Range, Target } from "./types";

/**
 * The curriculum surface is an alignment catalog, not a mastery model. A row
 * describes the mathematical representation and ranges that the game can
 * present; it does not infer learner proficiency from play.
 */
export type SkillRepresentation = "whole" | "fraction" | "decimal" | "negative";

export interface NumberLineJumperSkill {
  id: string;
  band: PlacementBand;
  grades: readonly [number, number];
  ccss: readonly string[];
  representation: SkillRepresentation;
  targetKinds: readonly NumberKind[];
  ranges: readonly Range[];
  focus: string;
  claimLimit: string;
}

const range = (min: number, max: number): Range => ({ min, max });

/**
 * One row exists for each band/representation focus the generators expose.
 * Keep this table data-only: generation, scoring, and adaptation must remain
 * owned by engine.ts.
 */
export const NUMBER_LINE_JUMPER_SKILLS: readonly NumberLineJumperSkill[] = [
  {
    id: "nlj-g12-whole",
    band: "g12",
    grades: [1, 2],
    ccss: ["1.NBT.A.1", "2.NBT.A.2"],
    representation: "whole",
    targetKinds: ["whole"],
    ranges: [range(0, 10), range(0, 20), range(0, 100)],
    focus: "Whole-number magnitude and landmark placement.",
    claimLimit: "Practices placing whole numbers; it does not assess place-value mastery.",
  },
  {
    id: "nlj-g34-fraction",
    band: "g34",
    grades: [3, 4],
    ccss: ["3.NF.A.1", "3.NF.A.2", "3.NF.A.3", "4.NF.A.1"],
    representation: "fraction",
    targetKinds: ["fraction"],
    ranges: [range(0, 1), range(0, 2)],
    focus: "Unit, proper, improper, and mixed fraction magnitude on a number line.",
    claimLimit: "Practices locating generated fractions; it does not assess fraction equivalence or operations.",
  },
  {
    id: "nlj-g34-whole",
    band: "g34",
    grades: [3, 4],
    ccss: ["3.NF.A.2"],
    representation: "whole",
    targetKinds: ["whole"],
    ranges: [range(0, 1), range(0, 2)],
    focus: "Whole-number landmarks within fraction-scale lines.",
    claimLimit: "Landmarks support fraction-line reasoning; they do not create a separate whole-number mastery claim.",
  },
  {
    id: "nlj-g56-decimal",
    band: "g56",
    grades: [5, 6],
    ccss: ["5.NBT.A.3", "5.NBT.A.4", "6.NS.B.3"],
    representation: "decimal",
    targetKinds: ["decimal"],
    ranges: [range(0, 1), range(0, 10)],
    focus: "Tenths and hundredths magnitude on positive number lines.",
    claimLimit: "Practices estimating generated decimals; it does not assess decimal computation or rounding mastery.",
  },
  {
    id: "nlj-g56-fraction",
    band: "g56",
    grades: [5, 6],
    ccss: ["4.NF.A.2", "6.NS.C.6"],
    representation: "fraction",
    targetKinds: ["fraction"],
    ranges: [range(0, 1), range(0, 2), range(0, 3), range(0, 10)],
    focus: "Fraction magnitude, including generated mixed-number values.",
    claimLimit: "Extends number-line estimation to generated fractions; it does not assess fraction operations or mastery.",
  },
  {
    id: "nlj-g56-whole",
    band: "g56",
    grades: [5, 6],
    ccss: ["6.NS.C.6"],
    representation: "whole",
    targetKinds: ["whole"],
    ranges: [range(0, 10)],
    focus: "Whole-number landmarks in the g5–6 mixed Challenge pool.",
    claimLimit: "This is a Challenge representation switch, not an independent mastery measure.",
  },
  {
    id: "nlj-g78-fraction",
    band: "g78",
    grades: [7, 8],
    ccss: ["6.NS.C.6", "6.NS.C.7"],
    representation: "fraction",
    targetKinds: ["fraction"],
    ranges: [range(-10, 10)],
    focus: "Signed fraction magnitude on a line spanning zero.",
    claimLimit: "Practices locating generated signed fractions; it does not assess rational-number operations.",
  },
  {
    id: "nlj-g78-decimal",
    band: "g78",
    grades: [7, 8],
    ccss: ["6.NS.C.6", "6.NS.C.7"],
    representation: "decimal",
    targetKinds: ["decimal"],
    ranges: [range(-10, 10), range(0, 1000)],
    focus: "Signed and large-scale decimal magnitude.",
    claimLimit: "Practices estimating generated decimals; it does not assess rational-number operations or mastery.",
  },
  {
    id: "nlj-g78-whole",
    band: "g78",
    grades: [7, 8],
    ccss: ["6.NS.C.6", "6.NS.C.7"],
    representation: "whole",
    targetKinds: ["whole"],
    ranges: [range(-10, 10), range(0, 1000)],
    focus: "Whole-number magnitude across signed and large-scale lines.",
    claimLimit: "Practices placing generated whole-number landmarks; it does not assess integer operations.",
  },
  {
    id: "nlj-g78-negative",
    band: "g78",
    grades: [7, 8],
    ccss: ["6.NS.C.6", "6.NS.C.7"],
    representation: "negative",
    targetKinds: ["negative"],
    ranges: [range(-10, 10)],
    focus: "Negative-number magnitude and position relative to zero.",
    claimLimit: "Practices locating generated negative values; it does not assess signed-number operations.",
  },
];

function sameRange(left: Range, right: Range): boolean {
  return left.min === right.min && left.max === right.max;
}

/** Return every registry row that could describe a generated target. */
export function skillsForTarget(band: PlacementBand, target: Target): readonly NumberLineJumperSkill[] {
  return NUMBER_LINE_JUMPER_SKILLS.filter((skill) =>
    skill.band === band
      && skill.targetKinds.includes(target.kind)
      && skill.ranges.some((candidate) => sameRange(candidate, target.range)),
  );
}

/**
 * Resolve one generated target to exactly one curriculum row. Failing closed
 * keeps a future generator change from silently creating an unmapped claim.
 */
export function skillForTarget(band: PlacementBand, target: Target): NumberLineJumperSkill {
  const matches = skillsForTarget(band, target);
  if (matches.length !== 1) {
    throw new Error(`Expected exactly one Number Line Jumper skill for ${band}/${target.kind}/${target.range.min}-${target.range.max}, found ${matches.length}`);
  }
  return matches[0]!;
}
