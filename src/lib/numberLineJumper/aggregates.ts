/**
 * Number Line Jumper — session aggregate contract (LEVELBEST-61).
 *
 * A pure, typed aggregate over one visit's scored trials. The structure is
 * the future Tier-1 parent-brief handoff seam: the free site computes it in
 * memory only and never persists or transmits it; an account-backed build can
 * bind this structure later without engine changes.
 *
 * Semantics reuse the authoritative engine helpers — the overall mean and
 * close counts are read from `summarizeRound`, the representation keys reuse
 * `representationOf`, and a trial counts as close exactly when the engine
 * already classified it `exact` or `close` (relative error ≤ 15 %). No
 * second definition of error or closeness exists in this module.
 */

import { representationOf, summarizeRound } from "./engine";
import type { MixedRepresentation, Range, TrialRecord } from "./types";

/**
 * Immutable session state accepted by the aggregate. `trials` are the scored
 * records for the current page-session run, in play order.
 */
export interface NljSessionState {
  trials: readonly TrialRecord[];
}

/** Aggregate over one grouping (overall, per representation, or per range). */
export interface SessionAggregateSlice {
  /** Completed trials in this slice — the denominator for every rate below. */
  trials: number;
  /** Trials classified `exact` or `close` by the engine (relative error ≤ 15 %). */
  closeCount: number;
  /** Mean relative error across the slice, or null when the slice is empty. */
  avgRelativeError: number | null;
  /** closeCount / trials * 100, on a 0–100 scale, or null when the slice is empty. */
  pctClose: number | null;
}

/** Range slice; the bounds are repeated so a brief never re-derives them. */
export interface SessionRangeAggregate extends SessionAggregateSlice {
  min: number;
  max: number;
}

/** Stable session aggregate for a future parent-brief adapter. */
export interface SessionAggregates {
  trials: number;
  closeCount: number;
  avgRelativeError: number | null;
  pctClose: number | null;
  /** Always present for every canonical representation key, even at zero trials. */
  perRepresentation: Record<MixedRepresentation, SessionAggregateSlice>;
  /** One entry per observed range, keyed `"<min>:<max>"`, sorted by key. */
  perRange: Record<string, SessionRangeAggregate>;
}

/** Range bucket key — identical keying to the engine's own range stats. */
export function rangeKey(range: Range): string {
  return `${range.min}:${range.max}`;
}

/**
 * A completed trial is a record the engine could have scored: a finite,
 * non-negative relative error plus a known closeness tier. The game shell
 * always produces these via `scorePlacement`; the check exists so a future
 * Tier-1 adapter can trust the totals without re-validating raw records.
 */
function isCompletedTrial(trial: TrialRecord): boolean {
  return (
    typeof trial.error === "number" &&
    Number.isFinite(trial.error) &&
    trial.error >= 0 &&
    (trial.closeness === "exact" || trial.closeness === "close" || trial.closeness === "far")
  );
}

function isClose(closeness: TrialRecord["closeness"]): boolean {
  return closeness === "exact" || closeness === "close";
}

function emptySlice(): SessionAggregateSlice {
  return { trials: 0, closeCount: 0, avgRelativeError: null, pctClose: null };
}

function finalizeSlice(
  trials: number,
  closeCount: number,
  errorSum: number,
): SessionAggregateSlice {
  if (trials === 0) return { trials: 0, closeCount: 0, avgRelativeError: null, pctClose: null };
  return {
    trials,
    closeCount,
    avgRelativeError: errorSum / trials,
    pctClose: (closeCount / trials) * 100,
  };
}

/**
 * Aggregate one visit's trials. Pure and deterministic: the same state always
 * yields a deep-equal result. Malformed records (see `isCompletedTrial`) are
 * excluded from every slice; records without a `kind` count toward the
 * overall totals but no representation bucket, and records without a `range`
 * count toward the overall totals but no range bucket.
 */
export function sessionAggregates(state: NljSessionState): SessionAggregates {
  const completed = state.trials.filter(isCompletedTrial);

  if (completed.length === 0) {
    return {
      trials: 0,
      closeCount: 0,
      avgRelativeError: null,
      pctClose: null,
      perRepresentation: {
        whole: emptySlice(),
        fraction: emptySlice(),
        decimal: emptySlice(),
      },
      perRange: {},
    };
  }

  // Overall mean and close counts come from the authoritative round summary —
  // the same single source the summary screen and visit bests already read.
  const summary = summarizeRound(completed);

  const repStats: Record<MixedRepresentation, { trials: number; close: number; errorSum: number }> = {
    whole: { trials: 0, close: 0, errorSum: 0 },
    fraction: { trials: 0, close: 0, errorSum: 0 },
    decimal: { trials: 0, close: 0, errorSum: 0 },
  };
  const rangeStats = new Map<string, { range: Range; trials: number; close: number; errorSum: number }>();

  for (const trial of completed) {
    if (trial.kind) {
      const rep = repStats[representationOf(trial.kind)];
      rep.trials += 1;
      if (isClose(trial.closeness)) rep.close += 1;
      rep.errorSum += trial.error;
    }
    if (trial.range) {
      const key = rangeKey(trial.range);
      const stats = rangeStats.get(key) ?? { range: trial.range, trials: 0, close: 0, errorSum: 0 };
      stats.trials += 1;
      if (isClose(trial.closeness)) stats.close += 1;
      stats.errorSum += trial.error;
      rangeStats.set(key, stats);
    }
  }

  const perRange: Record<string, SessionRangeAggregate> = {};
  for (const [key, stats] of [...rangeStats.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
    const slice = finalizeSlice(stats.trials, stats.close, stats.errorSum);
    perRange[key] = { min: stats.range.min, max: stats.range.max, ...slice };
  }

  return {
    trials: completed.length,
    closeCount: summary.closeCount,
    avgRelativeError: summary.averageError,
    pctClose: (summary.closeCount / completed.length) * 100,
    perRepresentation: {
      whole: finalizeSlice(repStats.whole.trials, repStats.whole.close, repStats.whole.errorSum),
      fraction: finalizeSlice(repStats.fraction.trials, repStats.fraction.close, repStats.fraction.errorSum),
      decimal: finalizeSlice(repStats.decimal.trials, repStats.decimal.close, repStats.decimal.errorSum),
    },
    perRange,
  };
}
