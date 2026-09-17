/** Placement bands mirror the free-site mode pickers and later adaptive level signal. */
export type PlacementBand = "g12" | "g34" | "g56" | "g78";

export type NumberKind = "whole" | "fraction" | "decimal" | "negative";

/** Whole / fraction / decimal pool used by g5–8 Challenge mixed runs. */
export type MixedRepresentation = "whole" | "fraction" | "decimal";

export type RoundMode = "guided" | "challenge";

/** Intentional shape of a prompt within a structured round. */
export type TargetIntent = "anchor" | "interior" | "midpoint" | "contrast" | "mixed";

export type SummaryBias = "low" | "high" | "balanced" | "unknown";

export type SummaryTrend = "improving" | "steady" | "needs-focus" | "unknown";

export interface Range {
  min: number;
  max: number;
}

/** A single estimation prompt. Pure data — no UI. */
export interface Target {
  /** True numeric value on the number line. */
  value: number;
  /** Kid-facing label, e.g. "3/4", "0.7", "47", "−3". */
  display: string;
  kind: NumberKind;
  range: Range;
  /** Authored purpose inside a round; optional for hand-authored test targets. */
  intent?: TargetIntent;
}

export type Closeness = "exact" | "close" | "far";

export type Direction = "low" | "high" | "spot";

/** Result of scoring one placement. */
export interface PlacementScore {
  /** Relative absolute error: |player − true| / rangeLength. */
  error: number;
  /** Absolute difference in the units represented by the line. */
  absoluteError: number;
  /** Numeric value represented by the learner's placement. */
  playerValue: number;
  /** Numeric value represented by the target. */
  targetValue: number;
  /** Normalized learner position, clamped to the number line. */
  playerNormalized: number;
  /** Normalized target position on the number line. */
  targetNormalized: number;
  closeness: Closeness;
  /** Points awarded for this trial (0–10 scale). */
  points: number;
  /** Short coaching line — never shaming. */
  feedback: string;
  /** One strategy suggestion tied to this line and target. */
  nextStep: string;
  direction: Direction;
}

/** One scored trial used to build the round summary. */
export interface TrialRecord {
  /** Scored records are complete by default; explicit false marks a partial attempt. */
  completed?: boolean;
  error: number;
  closeness: Closeness;
  points: number;
  /** Optional detail captured only for the current in-memory round summary. */
  absoluteError?: number;
  playerValue?: number;
  targetValue?: number;
  direction?: Direction;
  kind?: NumberKind;
  range?: Range;
  intent?: TargetIntent;
}

/** Aggregate stats for an ended round. */
export interface RoundSummary {
  trials: number;
  totalPoints: number;
  averageError: number;
  closeCount: number;
  bestStreak: number;
  /** One plain-English coaching sentence. */
  coaching: string;
  /** Direction pattern, when the UI has recorded scored placements. */
  directionBias: SummaryBias;
  /** Whether the last few estimates improved relative to the opening attempts. */
  trend: SummaryTrend;
  lastThreeAverageError: number | null;
  strongestKind: NumberKind | null;
  strongestKindCloseRate: number | null;
  strongestRange: Range | null;
  midpointCloseRate: number | null;
}
