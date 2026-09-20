import type { RoundSummary } from "./types";

/**
 * Session-only visit bests.
 *
 * The visit is the current page session: state lives in React memory only
 * (no web storage, cookies, or network of any kind) and a reload starts
 * the visit over with no records. Metrics reuse the authoritative
 * `RoundSummary` values so no parallel stat calculation exists.
 */

/** Visit records held for the current page session; null until a first run completes. */
export interface VisitBests {
  /** Lowest average relative error achieved this visit (lower is better). */
  averageError: number;
  /** Longest close/exact streak achieved this visit (higher is better). */
  closeStreak: number;
}

/**
 * Whether a completed run just set a new visit best. Ties deliberately do
 * not count as improvements — matching an existing best is steady work, not
 * a record, so no "new record" callout is shown.
 */
export interface VisitBestDelta {
  averageError: boolean;
  closeStreak: boolean;
}

/** A first completed run establishes the visit baselines. */
export function firstVisitBests(summary: RoundSummary): VisitBests {
  return {
    averageError: summary.averageError,
    closeStreak: summary.bestStreak,
  };
}

/** Record copy shown under the visit-bests row on the summary. */
export function visitBestsLine(bests: VisitBests | null): string | null {
  if (bests === null) return null;
  return `Best this visit — avg. error ${formatError(bests.averageError)}, close streak ${bests.closeStreak} (clears when you reload).`;
}

/** Browser-tab session copy; distinct from the page-memory visit line. */
export function sessionBestsLine(bests: VisitBests | null): string | null {
  if (bests === null) return null;
  return `Best this session — avg. error ${formatError(bests.averageError)}, close streak ${bests.closeStreak} (clears when you close this tab).`;
}

/**
 * Fold a completed run's authoritative summary into the visit bests.
 * A run is only eligible when at least one trial was played; zero-trial
 * rounds (empty-state timeouts) never touch or create the records.
 */
export function updateVisitBests(
  bests: VisitBests | null,
  summary: RoundSummary,
): { bests: VisitBests | null; delta: VisitBestDelta } {
  if (summary.trials <= 0) {
    return { bests, delta: { averageError: false, closeStreak: false } };
  }
  if (bests === null) {
    // First completed run: it establishes the baselines silently. There is
    // no previous record to beat, so no "new best" callout is shown.
    return { bests: firstVisitBests(summary), delta: { averageError: false, closeStreak: false } };
  }
  const averageError = Math.min(bests.averageError, summary.averageError);
  const closeStreak = Math.max(bests.closeStreak, summary.bestStreak);
  return {
    bests: { averageError, closeStreak },
    delta: {
      averageError: summary.averageError < bests.averageError,
      closeStreak: summary.bestStreak > bests.closeStreak,
    },
  };
}

/**
 * Plain-English record callouts in the game's coaching voice. Positive and
 * factual, no shaming, no competitive framing, and never implying the
 * records outlive the visit.
 */
export function recordCallouts(delta: VisitBestDelta, summary: RoundSummary): string[] {
  const lines: string[] = [];
  if (delta.averageError) {
    lines.push(`New best average error this visit — ${formatError(summary.averageError)}. Every estimate is sharpening your number line.`);
  }
  if (delta.closeStreak) {
    lines.push(`New best close streak this visit — ${summary.bestStreak} in a row. Your midpoint habit is paying off.`);
  }
  return lines;
}

/** Session-scoped counterpart used after a browser-tab record improves. */
export function sessionRecordCallouts(delta: VisitBestDelta, summary: RoundSummary): string[] {
  const lines: string[] = [];
  if (delta.averageError) {
    lines.push(`New best average error this session — ${formatError(summary.averageError)}. Every estimate is sharpening your number line.`);
  }
  if (delta.closeStreak) {
    lines.push(`New best close streak this session — ${summary.bestStreak} in a row. Your midpoint habit is paying off.`);
  }
  return lines;
}

function formatError(error: number): string {
  return `${(error * 100).toFixed(1)}%`;
}
