import { exploreZoomTicks } from "./engine";
import type { Range } from "./types";

/**
 * Choose an unscored Explore prompt from the visible window's major ticks.
 * The caller owns the seeded random source so a session's prompt sequence is
 * deterministic without coupling Explore to scored-round state.
 */
export function generateExplorePrompt(
  window: Range,
  random: () => number,
  previousPrompt: number | null = null,
): number {
  const candidates = exploreZoomTicks(window).majorTicks.filter(
    (value) => Number.isFinite(value) && value >= window.min && value <= window.max,
  );
  if (candidates.length === 0) {
    throw new RangeError("Explore prompt window must contain at least one major tick");
  }

  const withoutPrevious = candidates.filter((value) => value !== previousPrompt);
  const choices = withoutPrevious.length > 0 ? withoutPrevious : candidates;
  const sample = random();
  const normalizedSample = Number.isFinite(sample)
    ? Math.min(1 - Number.EPSILON, Math.max(0, sample))
    : 0;
  return choices[Math.floor(normalizedSample * choices.length)]!;
}
