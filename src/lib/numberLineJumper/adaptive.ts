import type { Range, TargetIntent, TrialRecord } from "./types";

export type AdaptiveSide = "low" | "high";

/**
 * LEVELBEST-60 keeps adaptation deliberately small and inspectable. These
 * values are part of the behavior contract, not tuning magic hidden in the
 * target generator.
 */
export const ADAPTIVE_WINDOW_SIZE = 3;
export const ADAPTIVE_DIRECTIONAL_BIAS_THRESHOLD = 1 / 3;
export const ADAPTIVE_WEAK_SIDE_TARGET_PROBABILITY = 0.6;
export const ADAPTIVE_QUOTA_WINDOW_SIZE = 5;
export const ADAPTIVE_MIN_BIASED_TARGETS_PER_QUOTA_WINDOW = Math.ceil(
  ADAPTIVE_QUOTA_WINDOW_SIZE * ADAPTIVE_WEAK_SIDE_TARGET_PROBABILITY,
);
export const ADAPTIVE_HOT_ZONE_BIAS_STRENGTH = 0.35;
export const ADAPTIVE_HOT_ZONE_MIN_HALF_WIDTH = 0.08;
export const ADAPTIVE_HOT_ZONE_MAX_HALF_WIDTH = 0.24;
export const ADAPTIVE_HOT_ZONE_PADDING = 0.05;
export const ADAPTIVE_MIN_DECIMAL_OBSERVATIONS = 2;

export interface NormalizedHotZone {
  min: number;
  max: number;
  center: number;
}

export interface RecentTrialAnalysis {
  recentTrials: readonly TrialRecord[];
  lowCount: number;
  highCount: number;
  /** Positive values mean high-side responses; negative values mean low-side responses. */
  directionalBias: number;
  meanRelativeError: number;
  /** A normalized target/marker gap band for recent decimal trials, when there is enough evidence. */
  hotZone: NormalizedHotZone | null;
}

export interface AdaptiveBias {
  directionalBias: number;
  meanRelativeError: number;
  weakSide: AdaptiveSide | null;
  hotZone: NormalizedHotZone | null;
}

function clampUnit(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function isFiniteRange(value: unknown): value is Range {
  if (!value || typeof value !== "object") return false;
  const range = value as Range;
  return Number.isFinite(range.min) && Number.isFinite(range.max) && range.max > range.min;
}

function normalizedValue(value: number, range: Range): number | null {
  if (!Number.isFinite(value) || !isFiniteRange(range)) return null;
  const length = range.max - range.min;
  if (!Number.isFinite(length)) return null;
  return clampUnit((value - range.min) / length);
}

function hotZoneFor(trials: readonly TrialRecord[]): NormalizedHotZone | null {
  const decimalObservations = trials
    .map((trial) => {
      if (
        trial.kind !== "decimal" ||
        !isFiniteRange(trial.range) ||
        !Number.isFinite(trial.targetValue) ||
        !Number.isFinite(trial.playerValue)
      ) {
        return null;
      }
      const range = trial.range;
      const target = normalizedValue(trial.targetValue!, range);
      const player = normalizedValue(trial.playerValue!, range);
      if (target === null || player === null) return null;
      return {
        center: (target + player) / 2,
        halfWidth: Math.min(
          ADAPTIVE_HOT_ZONE_MAX_HALF_WIDTH,
          Math.max(ADAPTIVE_HOT_ZONE_MIN_HALF_WIDTH, Math.abs(target - player) / 2 + ADAPTIVE_HOT_ZONE_PADDING),
        ),
      };
    })
    .filter((observation): observation is { center: number; halfWidth: number } => observation !== null);

  if (decimalObservations.length < ADAPTIVE_MIN_DECIMAL_OBSERVATIONS) return null;

  const center = decimalObservations.reduce((sum, observation) => sum + observation.center, 0) / decimalObservations.length;
  const spread = Math.max(...decimalObservations.map((observation) => Math.abs(observation.center - center)));
  const averageHalfWidth = decimalObservations.reduce((sum, observation) => sum + observation.halfWidth, 0) / decimalObservations.length;
  const halfWidth = Math.min(
    ADAPTIVE_HOT_ZONE_MAX_HALF_WIDTH,
    Math.max(ADAPTIVE_HOT_ZONE_MIN_HALF_WIDTH, averageHalfWidth + spread),
  );

  return {
    center,
    min: clampUnit(center - halfWidth),
    max: clampUnit(center + halfWidth),
  };
}

function isAdaptiveTrial(value: TrialRecord | null | undefined): value is TrialRecord {
  if (!value || typeof value !== "object" || value.completed === false) return false;
  const hasDirection = value.direction === "low" || value.direction === "high" || value.direction === "spot";
  return hasDirection && Number.isFinite(value.error) && value.error >= 0;
}

/** Analyze only the last three completed trials; incomplete records are ignored. */
export function analyzeRecentTrials(
  trials: readonly (TrialRecord | null | undefined)[],
): RecentTrialAnalysis {
  const completed = (Array.isArray(trials) ? trials : []).filter(isAdaptiveTrial);
  const recentTrials = completed.slice(-ADAPTIVE_WINDOW_SIZE);
  const lowCount = recentTrials.filter((trial) => trial.direction === "low").length;
  const highCount = recentTrials.filter((trial) => trial.direction === "high").length;
  const directionalBias = recentTrials.length ? (highCount - lowCount) / recentTrials.length : 0;
  const meanRelativeError = recentTrials.length
    ? recentTrials.reduce((sum, trial) => sum + trial.error, 0) / recentTrials.length
    : 0;

  return {
    recentTrials,
    lowCount,
    highCount,
    directionalBias,
    meanRelativeError,
    hotZone: hotZoneFor(recentTrials),
  };
}

/** Derive the bounded policy from a recent-trial analysis or raw trial records. */
export function deriveAdaptiveBias(
  input: RecentTrialAnalysis | readonly (TrialRecord | null | undefined)[],
): AdaptiveBias {
  const analysis: RecentTrialAnalysis = Array.isArray(input)
    ? analyzeRecentTrials(input as readonly (TrialRecord | null | undefined)[])
    : (input as RecentTrialAnalysis);
  const weakSide =
    analysis.recentTrials.length >= ADAPTIVE_WINDOW_SIZE &&
    Math.abs(analysis.directionalBias) > ADAPTIVE_DIRECTIONAL_BIAS_THRESHOLD
      ? analysis.directionalBias < 0
        ? "low"
        : "high"
      : null;

  return {
    directionalBias: analysis.directionalBias,
    meanRelativeError: analysis.meanRelativeError,
    weakSide,
    hotZone: analysis.hotZone,
  };
}

/** Midpoint prompts stay neutral; these are the target intents adaptation may tune. */
export function isAdaptiveTargetIntent(intent: TargetIntent | undefined): boolean {
  return intent === "anchor" || intent === "interior" || intent === "contrast";
}

/** Return the normalized side of a target, leaving the exact midpoint neutral. */
export function sideForNormalizedPosition(normalized: number): AdaptiveSide | null {
  if (normalized < 0.5) return "low";
  if (normalized > 0.5) return "high";
  return null;
}

/**
 * Select a side-biased slot with a deterministic quota floor. The PRNG picks
 * the placement of the three biased slots, while the end-of-window safeguard
 * guarantees at least 3 of every 5 applicable slots.
 */
export function shouldBiasNextTarget(
  rng: () => number,
  quotaPosition: number,
  quotaBiased: number,
): boolean {
  const position = Math.min(ADAPTIVE_QUOTA_WINDOW_SIZE - 1, Math.max(0, quotaPosition));
  const biased = Math.min(ADAPTIVE_MIN_BIASED_TARGETS_PER_QUOTA_WINDOW, Math.max(0, quotaBiased));
  const remaining = ADAPTIVE_QUOTA_WINDOW_SIZE - position;
  const remainingNeeded = ADAPTIVE_MIN_BIASED_TARGETS_PER_QUOTA_WINDOW - biased;
  if (remainingNeeded <= 0) return false;
  if (remainingNeeded >= remaining) return true;
  return rng() < remainingNeeded / remaining;
}
