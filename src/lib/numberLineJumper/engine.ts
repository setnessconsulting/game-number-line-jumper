import type {
  Closeness,
  Direction,
  MixedRepresentation,
  NumberKind,
  PlacementBand,
  PlacementScore,
  Range,
  RoundMode,
  RoundSummary,
  Target,
  TargetIntent,
  TrialRecord,
} from "./types";
import {
  ADAPTIVE_HOT_ZONE_BIAS_STRENGTH,
  ADAPTIVE_QUOTA_WINDOW_SIZE,
  analyzeRecentTrials,
  deriveAdaptiveBias,
  isAdaptiveTargetIntent,
  sideForNormalizedPosition,
  shouldBiasNextTarget,
} from "./adaptive";
import type { AdaptiveBias, AdaptiveSide, NormalizedHotZone } from "./adaptive";

// ---------------------------------------------------------------------------
// Deterministic PRNG re-exported from the shared game utility module.
// Re-exported here so existing call sites and tests keep working; the
// algorithm is byte-for-byte the legacy one.
// ---------------------------------------------------------------------------

export { mulberry32 } from "@/lib/games/shared/rng";

function pickInt(rng: () => number, minInclusive: number, maxInclusive: number): number {
  const span = maxInclusive - minInclusive + 1;
  return minInclusive + Math.floor(rng() * span);
}

function pickFrom<T>(rng: () => number, list: readonly T[]): T {
  return list[Math.floor(rng() * list.length)!]!;
}

interface TargetGenerationBias {
  preferredSide?: AdaptiveSide;
  hotZone?: NormalizedHotZone;
}

function pickWeighted<T extends string>(
  rng: () => number,
  items: readonly T[],
  weights: Record<T, number>,
): T {
  let total = 0;
  for (const item of items) total += weights[item];
  let roll = rng() * total;
  for (const item of items) {
    roll -= weights[item];
    if (roll < 0) return item;
  }
  return items[items.length - 1]!;
}

/** The ranges are shared with the untimed exploration view. */
export function rangesForBand(band: PlacementBand): readonly Range[] {
  return RANGES[band];
}

// ---------------------------------------------------------------------------
// Range tables per band
// ---------------------------------------------------------------------------

const RANGES: Record<PlacementBand, readonly Range[]> = {
  g12: [
    { min: 0, max: 10 },
    { min: 0, max: 20 },
    { min: 0, max: 100 },
  ],
  g34: [
    { min: 0, max: 1 },
    { min: 0, max: 2 },
  ],
  g56: [
    { min: 0, max: 1 },
    { min: 0, max: 10 },
  ],
  g78: [
    { min: -10, max: 10 },
    { min: 0, max: 1000 },
  ],
};

// The 0–2 and 0–3 additions are intentionally fraction-only. Keeping them out
// of RANGES preserves the existing Explore selector and the decimal path.
const G56_FRACTION_RANGES: readonly Range[] = [
  ...RANGES.g56,
  { min: 0, max: 2 },
  { min: 0, max: 3 },
];

/** Ranges available to the fraction generator without changing Explore. */
export function rangesForFraction(band: PlacementBand): readonly Range[] {
  return band === "g56" ? G56_FRACTION_RANGES : RANGES[band];
}

// ---------------------------------------------------------------------------
// Zoomable Explore extension for unscored scale comprehension.
// The zoom line is a fixed anchor span of −10…1000 whose visible window is a
// sub-interval chosen by integer zoom level. Tick subdivision follows powers
// of 10 so labels stay readable at every scale. Pure math only — no UI, no
// storage, no network; the Explore shell owns interaction state in memory.
// ---------------------------------------------------------------------------

/** Fixed anchor span for the zoomable Explore line. */
export const EXPLORE_ZOOM_ANCHOR: Range = { min: -10, max: 1000 };

/** Discrete zoom levels; each level names one visible window on the anchor. */
export const EXPLORE_ZOOM_LEVELS = 8;

/**
 * Visible window for a zoom level, clamped into the caller's integer range.
 * Level 0 shows the whole −10…1000 anchor; each level zooms one power-of-10
 * step deeper toward the anchor midpoint, down to a span-10 window that keeps
 * decimal subdivision meaningful. `persistedNorm` (the jumper's 0–1 position
 * on the previous window) re-anchors so the jumper's *value* is preserved
 * across zoom when the window still contains it, and clamps to the window
 * edge otherwise.
 */
export function exploreZoomWindow(level: number, persistedNorm: number, previous?: Range): Range {
  const clampedLevel = Math.min(EXPLORE_ZOOM_LEVELS - 1, Math.max(0, Math.floor(level)));
  const anchorSpan = EXPLORE_ZOOM_ANCHOR.max - EXPLORE_ZOOM_ANCHOR.min;
  const span = Math.max(10, anchorSpan / 10 ** clampedLevel);
  const prev = previous ?? EXPLORE_ZOOM_ANCHOR;
  const prevSpan = prev.max - prev.min;
  const pivotValue = prevSpan <= 0 ? prev.min : prev.min + Math.min(1, Math.max(0, persistedNorm)) * prevSpan;
  const center = Math.min(EXPLORE_ZOOM_ANCHOR.max - span / 2, Math.max(EXPLORE_ZOOM_ANCHOR.min + span / 2, pivotValue));
  return { min: center - span / 2, max: center + span / 2 };
}

/**
 * Tick subdivision for a visible window: the largest power-of-10 step that
 * yields at most 10 major ticks, plus one decimal subdivision step. Always
 * returns finite, positive steps with `minor = major / 10`.
 */
export function exploreZoomTicks(window: Range): { major: number; minor: number; majorTicks: number[] } {
  const span = window.max - window.min;
  const safeSpan = Number.isFinite(span) && span > 0 ? span : 10;
  const exponent = Math.floor(Math.log10(safeSpan / 10));
  const major = 10 ** exponent;
  const minor = major / 10;
  const first = Math.ceil(window.min / major) * major;
  const majorTicks: number[] = [];
  for (let tick = first; tick <= window.max + major / 2; tick += major) {
    majorTicks.push(Math.abs(tick) < major / 2 ? 0 : tick);
    if (majorTicks.length > 12) break;
  }
  return { major, minor, majorTicks };
}

/**
 * Pan the visible window by `direction` (±1) of half its span, clamped so the
 * window never leaves the −10…1000 anchor. Pure: inputs are never mutated.
 */
export function exploreZoomPan(window: Range, direction: 1 | -1): Range {
  const span = window.max - window.min;
  if (!Number.isFinite(span) || span <= 0) return { ...EXPLORE_ZOOM_ANCHOR };
  const nextMin = window.min + direction * (span / 2);
  const clampedMin = Math.min(EXPLORE_ZOOM_ANCHOR.max - span, Math.max(EXPLORE_ZOOM_ANCHOR.min, nextMin));
  return { min: clampedMin, max: clampedMin + span };
}

/**
 * Norm of `value` on `window` for marker rendering, clamped to [0, 1].
 * Degenerate (zero-span) windows map to the midpoint rather than NaN.
 */
export function exploreZoomNormForValue(value: number, window: Range): number {
  if (!Number.isFinite(value)) return 0.5;
  const span = window.max - window.min;
  if (!Number.isFinite(span) || span <= 0) return 0.5;
  return Math.min(1, Math.max(0, (value - window.min) / span));
}

// ---------------------------------------------------------------------------
// Target generation
// ---------------------------------------------------------------------------

function gcd(a: number, b: number): number {
  let x = Math.abs(a);
  let y = Math.abs(b);
  while (y) {
    const t = y;
    y = x % y;
    x = t;
  }
  return x || 1;
}

export type FractionDisplayMode = "mixed" | "improper";

export function formatFraction(
  n: number,
  d: number,
  displayMode: FractionDisplayMode = "mixed",
): { display: string; value: number; isWhole: boolean } {
  const g = gcd(n, d);
  const nn = n / g;
  const dd = d / g;
  if (dd === 1) {
    return { display: String(nn), value: nn, isWhole: true };
  }
  if (nn > dd) {
    if (displayMode === "improper") {
      return { display: `${nn}/${dd}`, value: nn / dd, isWhole: false };
    }
    const whole = Math.floor(nn / dd);
    const remainder = nn % dd;
    return {
      display: `${whole} ${remainder}/${dd}`,
      value: nn / dd,
      isWhole: false,
    };
  }
  return { display: `${nn}/${dd}`, value: nn / dd, isWhole: false };
}

function formatDecimal(value: number, places: number): string {
  // Trim trailing zeros for cleaner kid display.
  const fixed = value.toFixed(places);
  const trimmed = fixed.replace(/\.?0+$/, "") || "0";
  return trimmed.startsWith("-") ? `−${trimmed.slice(1)}` : trimmed;
}

/** Prefer interior values so estimation is required; occasionally allow near ends. */
function baselineInteriorSample(rng: () => number, min: number, max: number, intent: TargetIntent): number {
  const length = max - min;
  const landmarks = [min, min + length * 0.5, max];

  if (intent === "anchor") {
    return pickFrom(rng, landmarks);
  }
  if (intent === "midpoint") {
    return min + length * (0.46 + rng() * 0.08);
  }
  if (intent === "contrast") {
    return min + length * (rng() < 0.5 ? 0.12 + rng() * 0.08 : 0.8 + rng() * 0.08);
  }

  // 15 % chance of near-endpoint / midpoint for early success; otherwise interior.
  if (rng() < 0.15) {
    return pickFrom(rng, landmarks);
  }
  // Uniform in (10 % … 90 %) of the range.
  return min + length * (0.1 + rng() * 0.8);
}

function intersectWindow(
  left: readonly [number, number],
  right: readonly [number, number],
): [number, number] | null {
  const min = Math.max(left[0], right[0]);
  const max = Math.min(left[1], right[1]);
  return min <= max ? [min, max] : null;
}

function intentWindows(intent: TargetIntent, preferredSide?: AdaptiveSide): readonly (readonly [number, number])[] {
  if (intent === "contrast") {
    if (preferredSide === "low") return [[0.12, 0.2]];
    if (preferredSide === "high") return [[0.8, 0.88]];
    return [[0.12, 0.2], [0.8, 0.88]];
  }
  if (intent === "interior") {
    if (preferredSide === "low") return [[0.1, 0.44]];
    if (preferredSide === "high") return [[0.56, 0.9]];
    return [[0.1, 0.9]];
  }
  return [];
}

function sampleWindow(rng: () => number, windows: readonly (readonly [number, number])[]): number {
  const window = windows[Math.floor(rng() * windows.length)] ?? [0.1, 0.9];
  return window[0] + rng() * (window[1] - window[0]);
}

function sampleInterior(
  rng: () => number,
  min: number,
  max: number,
  intent: TargetIntent = "mixed",
  preference?: TargetGenerationBias,
): number {
  if (!preference || (!preference.preferredSide && !preference.hotZone)) {
    return baselineInteriorSample(rng, min, max, intent);
  }

  const length = max - min;
  if (intent === "anchor" && preference.preferredSide) {
    return preference.preferredSide === "low" ? min : max;
  }
  if (intent === "interior" && preference.preferredSide && rng() < 0.15) {
    // Preserve the baseline easy-landmark chance while keeping the selected
    // endpoint on the learner's practice side.
    return preference.preferredSide === "low" ? min : max;
  }
  if (intent !== "interior" && intent !== "contrast") {
    return baselineInteriorSample(rng, min, max, intent);
  }

  if (preference.hotZone && rng() < ADAPTIVE_HOT_ZONE_BIAS_STRENGTH) {
    const zone = [preference.hotZone.min, preference.hotZone.max] as const;
    const hotWindows = intentWindows(intent, preference.preferredSide)
      .map((window) => intersectWindow(window, zone))
      .filter((window): window is [number, number] => window !== null);
    if (hotWindows.length > 0) {
      return min + length * sampleWindow(rng, hotWindows);
    }
  }

  const sideWindows = intentWindows(intent, preference.preferredSide);
  if (preference.preferredSide && sideWindows.length > 0) {
    return min + length * sampleWindow(rng, sideWindows);
  }
  return baselineInteriorSample(rng, min, max, intent);
}

function sideOnlyPreference(preference?: TargetGenerationBias): TargetGenerationBias | undefined {
  return preference?.preferredSide ? { preferredSide: preference.preferredSide } : undefined;
}

function generateWhole(
  rng: () => number,
  range: Range,
  intent: TargetIntent,
  preference?: TargetGenerationBias,
): Target {
  const raw = sampleInterior(rng, range.min, range.max, intent, sideOnlyPreference(preference));
  // Prefer integers for whole-number bands.
  const value = Math.round(raw);
  const clamped = Math.min(range.max, Math.max(range.min, value));
  return {
    value: clamped,
    display: String(clamped),
    kind: "whole",
    range,
    intent,
  };
}

function generateFraction(
  rng: () => number,
  range: Range,
  intent: TargetIntent,
  options: FractionGenerationOptions = {},
): Target {
  const {
    unitOnly = false,
    preference,
    improperOnly = false,
    displayMode = "mixed",
  } = options;
  // Simple fractions on 0–1 or 0–2. Grade 3–4 normally passes unitOnly=true;
  // the explicit improper path is used only for its 0–2 fraction bank.
  const denominators = [2, 3, 4, 5, 6, 8, 10];
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const d = pickFrom(rng, denominators);
    const maxN = Math.floor(range.max * d);
    if (maxN < 1) continue;
    const minN = Math.max(1, Math.ceil(range.min * d), improperOnly ? d + 1 : 1);
    const side = intent === "midpoint" ? undefined : preference?.preferredSide;
    const sideMin = side === "high" ? Math.ceil((range.min + (range.max - range.min) * 0.54) * d) : minN;
    const sideMax = side === "low" ? Math.floor((range.min + (range.max - range.min) * 0.46) * d) : maxN;
    if (sideMin > sideMax || (unitOnly && (1 < sideMin || 1 > sideMax))) continue;
    let n = unitOnly ? 1 : pickInt(rng, sideMin, sideMax);
    if (intent === "midpoint" && !unitOnly && !improperOnly && range.max >= 1) {
      n = Math.min(maxN, Math.max(1, Math.round(d * 0.5)));
    }
    // Prefer proper / non-integral values.
    if (!unitOnly && n % d === 0) {
      n = Math.max(improperOnly ? d + 1 : 1, n - 1);
    }
    const formatted = formatFraction(n, d, displayMode);
    if (formatted.isWhole) continue;
    if (improperOnly && formatted.value <= 1) continue;
    if (formatted.value < range.min || formatted.value > range.max) continue;
    if (side && sideForNormalizedPosition((formatted.value - range.min) / (range.max - range.min)) !== side) continue;
    return {
      value: formatted.value,
      display: formatted.display,
      kind: "fraction",
      range,
      intent,
    };
  }

  // Fallback: walk the same rational bank so the selected display mode and
  // simplest-form invariant remain true even when seeded attempts miss.
  const side = intent === "midpoint" ? undefined : preference?.preferredSide;
  for (const d of denominators) {
    const minN = Math.max(1, Math.ceil(range.min * d), improperOnly ? d + 1 : 1);
    const maxN = Math.floor(range.max * d);
    const sideMin = side === "high" ? Math.ceil((range.min + (range.max - range.min) * 0.54) * d) : minN;
    const sideMax = side === "low" ? Math.floor((range.min + (range.max - range.min) * 0.46) * d) : maxN;
    for (let n = Math.max(minN, sideMin); n <= Math.min(maxN, sideMax); n += 1) {
      if (unitOnly && n !== 1) continue;
      if (!unitOnly && n % d === 0) continue;
      const fallback = formatFraction(n, d, displayMode);
      if (fallback.isWhole || (improperOnly && fallback.value <= 1)) continue;
      if (fallback.value < range.min || fallback.value > range.max) continue;
      if (side && sideForNormalizedPosition((fallback.value - range.min) / (range.max - range.min)) !== side) continue;
      return { value: fallback.value, display: fallback.display, kind: "fraction", range, intent };
    }
  }

  // This is reachable only for an incompatible preference/range combination
  // (for example, an improper value requested on 0–1). Preserve the historic
  // safe baseline for callers that did not request the strict improper path.
  if (improperOnly) {
    const fallback = formatFraction(3, 2, displayMode);
    if (!fallback.isWhole && fallback.value >= range.min && fallback.value <= range.max) {
      return { value: fallback.value, display: fallback.display, kind: "fraction", range, intent };
    }
  }
  return {
    value: Math.min(range.max, Math.max(range.min, 0.5)),
    display: formatFraction(1, 2, displayMode).display,
    kind: "fraction",
    range,
    intent,
  };
}

interface FractionGenerationOptions {
  unitOnly?: boolean;
  preference?: TargetGenerationBias;
  improperOnly?: boolean;
  displayMode?: FractionDisplayMode;
}

function formatSignedFraction(n: number, d: number): { display: string; value: number } {
  const sign = n < 0 ? "−" : "";
  const formatted = formatFraction(Math.abs(n), d);
  return {
    display: `${sign}${formatted.display}`,
    value: n / d,
  };
}

function generateSignedFraction(
  rng: () => number,
  range: Range,
  intent: TargetIntent,
  preference?: TargetGenerationBias,
): Target {
  const denominator = pickFrom(rng, [2, 3, 4, 5, 6, 8, 10]);
  const minNumerator = Math.ceil(range.min * denominator);
  const maxNumerator = Math.floor(range.max * denominator);
  const side = intent === "midpoint" ? undefined : preference?.preferredSide;
  const sideMin = side === "high"
    ? Math.ceil((range.min + (range.max - range.min) * 0.54) * denominator)
    : minNumerator;
  const sideMax = side === "low"
    ? Math.floor((range.min + (range.max - range.min) * 0.46) * denominator)
    : maxNumerator;
  let numerator = sideMin <= sideMax ? pickInt(rng, sideMin, sideMax) : pickInt(rng, minNumerator, maxNumerator);

  if (intent === "midpoint") {
    numerator = Math.round(((range.min + range.max) / 2) * denominator);
  }
  if (numerator === 0) numerator = rng() < 0.5 ? -1 : 1;
  if (numerator % denominator === 0) {
    const adjustment = side === "low" ? -1 : side === "high" ? 1 : numerator < 0 ? -1 : 1;
    numerator = Math.min(maxNumerator, Math.max(minNumerator, numerator + adjustment));
  }

  if (side) {
    const sideNumeratorMin = Math.max(minNumerator, sideMin);
    const sideNumeratorMax = Math.min(maxNumerator, sideMax);
    let validNumerator: number | null = null;
    for (let candidate = sideNumeratorMin; candidate <= sideNumeratorMax; candidate += 1) {
      const value = candidate / denominator;
      if (candidate % denominator !== 0 && sideForNormalizedPosition((value - range.min) / (range.max - range.min)) === side) {
        validNumerator = candidate;
        break;
      }
    }
    if (validNumerator !== null) numerator = validNumerator;
  }
  const finalFormatted = formatSignedFraction(numerator, denominator);
  return {
    value: finalFormatted.value,
    display: finalFormatted.display,
    kind: "fraction",
    range,
    intent,
  };
}

function generateDecimal(
  rng: () => number,
  range: Range,
  intent: TargetIntent,
  preference?: TargetGenerationBias,
): Target {
  const places = range.max <= 1 ? (rng() < 0.6 ? 1 : 2) : 1;
  const raw = sampleInterior(rng, range.min, range.max, intent, preference);
  const factor = 10 ** places;
  const value = Math.round(raw * factor) / factor;
  const clamped = Math.min(range.max, Math.max(range.min, value));
  return {
    value: clamped,
    display: formatDecimal(clamped, places),
    kind: "decimal",
    range,
    intent,
  };
}

function generateNegative(
  rng: () => number,
  range: Range,
  intent: TargetIntent,
  preference?: TargetGenerationBias,
): Target {
  const raw = sampleInterior(rng, range.min, range.max, intent, sideOnlyPreference(preference));
  const value = Math.round(raw);
  const clamped = Math.min(range.max, Math.max(range.min, value));
  const display = clamped < 0 ? `−${Math.abs(clamped)}` : String(clamped);
  return {
    value: clamped,
    display,
    kind: clamped < 0 ? "negative" : "whole",
    range,
    intent,
  };
}

/** Half of the eligible g3–4 0–2 fraction draws are improper. */
export const G34_IMPROPER_FRACTION_SHARE = 0.5;

/**
 * Generate one estimation target for the given placement band.
 * Deterministic for a given rng sequence.
 */
export function generateTarget(
  band: PlacementBand,
  rng: () => number,
  intent: TargetIntent = "mixed",
  preference?: TargetGenerationBias,
): Target {
  const ranges = RANGES[band];
  const range = pickFrom(rng, ranges);

  switch (band) {
    case "g12":
      return generateWhole(rng, range, intent, preference);
    case "g34":
      // Mix of unit fractions and simple wholes on the small ranges.
      if (rng() < 0.75) {
        const canUseImproper =
          range.max > 1 &&
          intent !== "midpoint" &&
          preference?.preferredSide !== "low";
        if (canUseImproper && rng() < G34_IMPROPER_FRACTION_SHARE) {
          return generateFraction(rng, range, intent, {
            improperOnly: true,
            displayMode: "improper",
            preference,
          });
        }
        // Unit fractions on 0–1 cannot reach the high side. A high-side
        // adaptive slot therefore uses the already-supported whole-number
        // path instead of breaking the g3–4 representation contract.
        return preference?.preferredSide === "high"
          ? generateWhole(rng, range, intent, preference)
          : generateFraction(rng, range, intent, { unitOnly: true, preference });
      }
      return generateWhole(rng, range, intent, preference);
    case "g56":
      return rng() < 0.7
        ? generateDecimal(rng, range, intent, preference)
        : generateFraction(rng, pickFrom(rng, rangesForFraction("g56")), intent, { preference });
    case "g78":
      if (range.min < 0) {
        const roll = rng();
        if (roll < 0.28) return generateSignedFraction(rng, range, intent, preference);
        if (roll < 0.62) return generateDecimal(rng, range, intent, preference);
        return generateNegative(rng, range, intent, preference);
      }
      return rng() < 0.5
        ? generateDecimal(rng, range, intent, preference)
        : generateWhole(rng, range, intent, preference);
    default: {
      const _exhaustive: never = band;
      return _exhaustive;
    }
  }
}

/**
 * A short authored-feeling rhythm keeps a round varied without adding a
 * second mechanic or making free-site levels adaptive.
 */
export const ROUND_TARGET_INTENTS: readonly TargetIntent[] = [
  "anchor",
  "interior",
  "midpoint",
  "interior",
  "contrast",
  "interior",
  "anchor",
  "contrast",
  "interior",
  "midpoint",
];

/** Challenge mode removes the early anchors and asks for more interior estimates. */
export const CHALLENGE_TARGET_INTENTS: readonly TargetIntent[] = [
  "interior",
  "contrast",
  "interior",
  "midpoint",
  "interior",
  "contrast",
  "interior",
  "midpoint",
  "interior",
  "contrast",
];

export const MIXED_REPRESENTATIONS: readonly MixedRepresentation[] = ["whole", "fraction", "decimal"];

/**
 * Locked g5–8 Challenge representation mix (CONSULTING-241).
 * Integers 3/3/4 → 30% whole, 30% fraction, 40% decimal before sequencing
 * constraints. Decimals are slightly heavier to keep the g5–6 tenths/hundredths
 * focus. No-repeat and late-run coverage flatten this toward even exposure;
 * typical observed shares stay within about 20–45% each.
 */
export const G58_CHALLENGE_REPRESENTATION_WEIGHTS: Record<MixedRepresentation, number> = {
  whole: 3,
  fraction: 3,
  decimal: 4,
};

/** Map a generated target kind onto the mixed Challenge pool. */
export function representationOf(kind: NumberKind): MixedRepresentation {
  return kind === "negative" ? "whole" : kind;
}

export function usesMixedChallengePool(band: PlacementBand, mode: RoundMode): boolean {
  return mode === "challenge" && (band === "g56" || band === "g78");
}

function mixedPool(): MixedRepresentation[] {
  return MIXED_REPRESENTATIONS.filter((rep) => G58_CHALLENGE_REPRESENTATION_WEIGHTS[rep] > 0);
}

/**
 * Deterministic weighted pick from the currently eligible representations.
 * Previous is always already seen, so forcing unseen kinds for coverage never
 * reselects the previous trial's representation.
 */
function selectMixedRepresentation(
  rng: () => number,
  previous: MixedRepresentation | null,
  seen: ReadonlySet<MixedRepresentation>,
  remaining: number,
): MixedRepresentation {
  const all = mixedPool();
  const missing = all.filter((rep) => !seen.has(rep));
  const eligible = all.filter((rep) => rep !== previous);
  const pool =
    missing.length > 0 && remaining <= missing.length
      ? missing
      : eligible.length > 0
        ? eligible
        : all;
  return pickWeighted(rng, pool, G58_CHALLENGE_REPRESENTATION_WEIGHTS);
}

function rangesForRepresentation(
  band: PlacementBand,
  representation: MixedRepresentation,
): readonly Range[] {
  if (band === "g56" && representation === "fraction") {
    return rangesForFraction(band);
  }
  const all = RANGES[band];
  if (band === "g56" && representation === "whole") {
    const compatible = all.filter((range) => range.max - range.min >= 10);
    return compatible.length ? compatible : all;
  }
  if (band === "g78" && representation === "fraction") {
    const compatible = all.filter((range) => range.min < 0);
    return compatible.length ? compatible : all;
  }
  return all;
}

function generateForRepresentation(
  band: PlacementBand,
  rng: () => number,
  intent: TargetIntent,
  representation: MixedRepresentation,
  preference?: TargetGenerationBias,
): Target {
  const range = pickFrom(rng, rangesForRepresentation(band, representation));
  switch (representation) {
    case "whole":
      return range.min < 0
        ? generateNegative(rng, range, intent, preference)
        : generateWhole(rng, range, intent, preference);
    case "fraction":
      return range.min < 0
        ? generateSignedFraction(rng, range, intent, preference)
        : generateFraction(rng, range, intent, { preference });
    case "decimal":
      return generateDecimal(rng, range, intent, preference);
    default: {
      const _exhaustive: never = representation;
      return _exhaustive;
    }
  }
}

function generateMixedChallengeTargets(
  band: PlacementBand,
  rng: () => number,
  count: number,
  intents: readonly TargetIntent[],
): Target[] {
  let previous: MixedRepresentation | null = null;
  const seen = new Set<MixedRepresentation>();
  return Array.from({ length: Math.max(0, count) }, (_, index) => {
    const representation = selectMixedRepresentation(rng, previous, seen, count - index);
    previous = representation;
    seen.add(representation);
    return generateForRepresentation(
      band,
      rng,
      intents[index % intents.length] ?? "mixed",
      representation,
    );
  });
}

export interface AdaptiveTargetGeneratorState {
  previousRepresentation: MixedRepresentation | null;
  seenRepresentations: readonly MixedRepresentation[];
  activeWeakSide: AdaptiveSide | null;
  /** Position inside the current five-applicable-target quota window. */
  quotaPosition: number;
  /** Number of intentionally weak-side-biased slots in that window. */
  quotaBiased: number;
}

export interface AdaptiveTargetGeneration {
  target: Target;
  state: AdaptiveTargetGeneratorState;
  bias: AdaptiveBias;
  /** True when this target was intentionally selected for the weaker side. */
  sideBiasApplied: boolean;
  /** True when the target intent participates in the side-bias quota. */
  sideBiasApplicable: boolean;
}

export function createAdaptiveTargetGeneratorState(): AdaptiveTargetGeneratorState {
  return {
    previousRepresentation: null,
    seenRepresentations: [],
    activeWeakSide: null,
    quotaPosition: 0,
    quotaBiased: 0,
  };
}

function targetSide(target: Target): AdaptiveSide | null {
  const length = target.range.max - target.range.min;
  if (length <= 0) return null;
  return sideForNormalizedPosition((target.value - target.range.min) / length);
}

/**
 * Generate exactly one target from the current response history. Baseline
 * intent and representation sequencing remain fixed; only the target's
 * location is tuned after enough completed evidence exists.
 */
export function generateAdaptiveTarget(
  band: PlacementBand,
  rng: () => number,
  index: number,
  mode: RoundMode,
  completedTrials: readonly TrialRecord[],
  state: AdaptiveTargetGeneratorState,
  totalTrials = ROUND_MAX_TRIALS,
): AdaptiveTargetGeneration {
  const intents = mode === "challenge" ? CHALLENGE_TARGET_INTENTS : ROUND_TARGET_INTENTS;
  const intent = intents[index % intents.length] ?? "mixed";
  const bias = deriveAdaptiveBias(analyzeRecentTrials(completedTrials));
  const alignedState =
    state.activeWeakSide === bias.weakSide
      ? state
      : {
          ...state,
          activeWeakSide: bias.weakSide,
          quotaPosition: 0,
          quotaBiased: 0,
        };
  const sideBiasApplicable = bias.weakSide !== null && isAdaptiveTargetIntent(intent);
  const sideBiasRequested = sideBiasApplicable
    ? shouldBiasNextTarget(rng, alignedState.quotaPosition, alignedState.quotaBiased)
    : false;
  const preference: TargetGenerationBias = {
    ...(sideBiasRequested && bias.weakSide ? { preferredSide: bias.weakSide } : {}),
    ...(bias.hotZone && (intent === "interior" || intent === "contrast")
      ? { hotZone: bias.hotZone }
      : {}),
  };

  let representation: MixedRepresentation | null = null;
  let target: Target;
  let nextSeenRepresentations = alignedState.seenRepresentations;
  if (usesMixedChallengePool(band, mode)) {
    representation = selectMixedRepresentation(
      rng,
      alignedState.previousRepresentation,
      new Set(alignedState.seenRepresentations),
      Math.max(1, totalTrials - index),
    );
    target = generateForRepresentation(band, rng, intent, representation, preference);
    nextSeenRepresentations = alignedState.seenRepresentations.includes(representation)
      ? alignedState.seenRepresentations
      : [...alignedState.seenRepresentations, representation];
  } else {
    target = generateTarget(band, rng, intent, preference);
  }

  const sideBiasApplied = sideBiasRequested && targetSide(target) === bias.weakSide;
  let quotaPosition = alignedState.quotaPosition;
  let quotaBiased = alignedState.quotaBiased;
  if (sideBiasApplicable) {
    quotaPosition += 1;
    if (sideBiasApplied) quotaBiased += 1;
    if (quotaPosition >= ADAPTIVE_QUOTA_WINDOW_SIZE) {
      quotaPosition = 0;
      quotaBiased = 0;
    }
  }

  return {
    target,
    bias,
    sideBiasApplied,
    sideBiasApplicable,
    state: {
      previousRepresentation: representation,
      seenRepresentations: nextSeenRepresentations,
      activeWeakSide: bias.weakSide,
      quotaPosition,
      quotaBiased,
    },
  };
}

export function generateRoundTargets(
  band: PlacementBand,
  rng: () => number,
  count = ROUND_MAX_TRIALS,
  mode: RoundMode = "guided",
): Target[] {
  const intents = mode === "challenge" ? CHALLENGE_TARGET_INTENTS : ROUND_TARGET_INTENTS;
  if (usesMixedChallengePool(band, mode)) {
    return generateMixedChallengeTargets(band, rng, Math.max(0, count), intents);
  }
  return Array.from({ length: Math.max(0, count) }, (_, index) =>
    generateTarget(band, rng, intents[index % intents.length] ?? "mixed"),
  );
}

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

/** Relative-error tiers shared with the sound cue pitch mapping. */
export const EXACT_THRESHOLD = 0.05; // ≤ 5 %
export const CLOSE_THRESHOLD = 0.15; // ≤ 15 %

/**
 * Inclusive tier membership absorbs binary floating-point dust in computed
 * errors. A nominally exact-threshold placement such as 0.55 on a 0–1 line
 * with a 0.5 target computes |0.55 − 0.5| = 0.050000000000000044 — one ulp
 * past the threshold — which a raw `<=` would misclassify and mirror
 * asymmetrically against 0.45. The tolerance is many orders of magnitude
 * above that ulp dust and far below the 0.10 tier gap, so genuinely farther
 * placements can never be pulled into a better tier.
 */
const TIER_TOLERANCE = 1e-12;

function meetsThreshold(error: number, threshold: number): boolean {
  return error <= threshold + TIER_TOLERANCE;
}

export function closenessFromError(error: number): Closeness {
  if (meetsThreshold(error, EXACT_THRESHOLD)) return "exact";
  if (meetsThreshold(error, CLOSE_THRESHOLD)) return "close";
  return "far";
}

function pointsFromCloseness(c: Closeness): number {
  switch (c) {
    case "exact":
      return 10;
    case "close":
      return 6;
    case "far":
      return 2;
  }
}

function directionOf(player: number, truth: number): Direction {
  const delta = player - truth;
  if (Math.abs(delta) < 1e-9) return "spot";
  return delta < 0 ? "low" : "high";
}

function midpointFor(range: Range): number {
  return range.min + (range.max - range.min) * 0.5;
}

/** Convert a normalized marker position into the value it represents. */
export function valueAtPosition(playerNormalized: number, range: Range): number {
  const clampedNorm = Math.min(1, Math.max(0, playerNormalized));
  return range.min + clampedNorm * (range.max - range.min);
}

/** Stable numeric copy used by the UI's visible and screen-reader readouts. */
export function formatNumberValue(value: number): string {
  const rounded = Math.abs(value) < 0.005 ? 0 : value;
  const text = Number.isInteger(rounded)
    ? String(rounded)
    : rounded.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
  return text.startsWith("-") ? `−${text.slice(1)}` : text;
}

/** Keep the slider's represented-value wording in one pure, testable path. */
export function ariaValueText(playerNormalized: number, range: Range): string {
  return `${formatNumberValue(valueAtPosition(playerNormalized, range))} on a line from ${formatNumberValue(range.min)} to ${formatNumberValue(range.max)}`;
}

/** Copy used when the warm-up reveals a rational target to assistive tech. */
export function targetRevealAnnouncement(target: Target): string {
  const span = target.range.max - target.range.min;
  const normalized = span === 0 ? 0.5 : (target.value - target.range.min) / span;
  return `The example target ${target.display} is at ${Math.round(normalized * 100)} percent across the line.`;
}

function strategyForTarget(target: Target, direction: Direction): string {
  const { min, max } = target.range;
  const midpoint = midpointFor(target.range);
  if (min < 0 && max > 0) {
    return target.value < 0
      ? "Find 0 first, then use the negative-side marks to estimate the target."
      : target.value > 0
        ? "Find 0 first, then use the positive-side marks to estimate the target."
        : "Find 0 first; the target is at the sign change.";
  }
  if (target.kind === "fraction") {
    return `Find the midpoint, then use ${formatNumberValue(min)} and ${formatNumberValue(max)} as anchors and partition the space into ${target.display.includes("/") ? "equal denominator parts" : "equal parts"}.`;
  }
  if (target.kind === "decimal") {
    return `Start at ${formatNumberValue(midpoint)}, then use tenths or hundredths to nudge toward the target.`;
  }
  if (max >= 1000) {
    const anchorStep = 10 ** Math.max(0, Math.floor(Math.log10(max)) - 1);
    let lowerAnchor = Math.floor(target.value / anchorStep) * anchorStep;
    let upperAnchor = Math.ceil(target.value / anchorStep) * anchorStep;
    if (lowerAnchor === upperAnchor) {
      lowerAnchor -= anchorStep;
      upperAnchor += anchorStep;
    }
    lowerAnchor = Math.max(min, lowerAnchor);
    upperAnchor = Math.min(max, upperAnchor);
    return `Use ${formatNumberValue(lowerAnchor)} and ${formatNumberValue(upperAnchor)} as nearby anchors, then estimate between them.`;
  }
  return direction === "low"
    ? `Start at ${formatNumberValue(midpoint)}, then nudge a little right.`
    : direction === "high"
      ? `Start at ${formatNumberValue(midpoint)}, then nudge a little left.`
      : `Start at ${formatNumberValue(midpoint)}, then compare equal-sized sections.`;
}

function feedbackFor(closeness: Closeness, direction: Direction): string {
  if (closeness === "exact") {
    if (direction === "spot") return "Spot on!";
    return direction === "low" ? "Very close — just left of the target." : "Very close — just right of the target.";
  }
  if (closeness === "close") {
    if (direction === "low") return "Close — a little low. Look for the middle.";
    if (direction === "high") return "Close — a little high. Look for the middle.";
    return "Close!";
  }
  // far
  if (direction === "low") return "Keep estimating — your marker was left of the target. Try picturing the midpoint first.";
  if (direction === "high") return "Keep estimating — your marker was right of the target. Try picturing the midpoint first.";
  return "Keep estimating — every try builds your number sense.";
}

/**
 * Score a player placement.
 * @param playerNormalized Position on the line in [0, 1] (0 = range.min, 1 = range.max).
 * @param target The true target.
 */
export function scorePlacement(playerNormalized: number, target: Target): PlacementScore {
  const { min, max } = target.range;
  const length = max - min;
  // Clamp input so extreme drags still produce a defined score.
  const clampedNorm = Math.min(1, Math.max(0, playerNormalized));
  const playerValue = min + clampedNorm * length;
  const absError = Math.abs(playerValue - target.value);
  const error = length === 0 ? 0 : absError / length;
  const closeness = closenessFromError(error);
  const direction = directionOf(playerValue, target.value);
  return {
    error,
    absoluteError: absError,
    playerValue,
    targetValue: target.value,
    playerNormalized: clampedNorm,
    targetNormalized: length === 0 ? 0.5 : (target.value - min) / length,
    closeness,
    points: pointsFromCloseness(closeness),
    feedback: feedbackFor(closeness, direction),
    nextStep: strategyForTarget(target, direction),
    direction,
  };
}

// ---------------------------------------------------------------------------
// Round summary
// ---------------------------------------------------------------------------

/** Stable strongest-representation order when close-rate and sample size tie. */
const KIND_TIEBREAK: Record<NumberKind, number> = {
  whole: 0,
  fraction: 1,
  decimal: 2,
  negative: 3,
};

/**
 * Build the end-of-round summary from trial records.
 * Coaching language is deterministic from the stats (no RNG).
 */
export function summarizeRound(trials: readonly TrialRecord[]): RoundSummary {
  const n = trials.length;
  if (n === 0) {
    return {
      trials: 0,
      totalPoints: 0,
      averageError: 0,
      closeCount: 0,
      bestStreak: 0,
      coaching: "Play a round to see how your estimation is growing.",
      directionBias: "unknown",
      trend: "unknown",
      lastThreeAverageError: null,
      strongestKind: null,
      strongestKindCloseRate: null,
      strongestRange: null,
      midpointCloseRate: null,
    };
  }

  let totalPoints = 0;
  let errorSum = 0;
  let closeCount = 0;
  let bestStreak = 0;
  let currentStreak = 0;
  let lowCount = 0;
  let highCount = 0;
  let midpointCount = 0;
  let midpointCloseCount = 0;
  const kindStats = new Map<NumberKind, { total: number; close: number; kind: NumberKind }>();
  const rangeStats = new Map<string, { total: number; close: number; range: NonNullable<TrialRecord["range"]> }>();

  for (const t of trials) {
    totalPoints += t.points;
    errorSum += t.error;
    if (t.closeness === "exact" || t.closeness === "close") {
      closeCount += 1;
      currentStreak += 1;
      bestStreak = Math.max(bestStreak, currentStreak);
    } else {
      currentStreak = 0;
    }
    if (t.direction === "low") lowCount += 1;
    if (t.direction === "high") highCount += 1;
    if (t.intent === "midpoint") {
      midpointCount += 1;
      if (t.closeness === "exact" || t.closeness === "close") midpointCloseCount += 1;
    }
    if (t.kind) {
      const stats = kindStats.get(t.kind) ?? { total: 0, close: 0, kind: t.kind };
      stats.total += 1;
      if (t.closeness === "exact" || t.closeness === "close") stats.close += 1;
      kindStats.set(t.kind, stats);
    }
    if (t.range) {
      const key = `${t.range.min}:${t.range.max}`;
      const stats = rangeStats.get(key) ?? { total: 0, close: 0, range: t.range };
      stats.total += 1;
      if (t.closeness === "exact" || t.closeness === "close") stats.close += 1;
      rangeStats.set(key, stats);
    }
  }

  const averageError = errorSum / n;
  const closeRate = closeCount / n;

  const directionBias =
    lowCount === 0 && highCount === 0
      ? "unknown"
      : highCount - lowCount >= 2
        ? "high"
        : lowCount - highCount >= 2
          ? "low"
          : "balanced";
  const lastThreeAverageError = n >= 3 ? averageErrorFor(trials.slice(-3)) : null;
  const openingAverageError = n >= 4 ? averageErrorFor(trials.slice(0, n - 3)) : null;
  const trend =
    lastThreeAverageError === null || openingAverageError === null
      ? "unknown"
      : openingAverageError - lastThreeAverageError >= 0.03
        ? "improving"
        : lastThreeAverageError - openingAverageError >= 0.03
          ? "needs-focus"
          : "steady";
  const strongestKindStats = [...kindStats.values()]
    .filter((stats) => stats.total >= 2)
    .sort(
      (a, b) =>
        b.close / b.total - a.close / a.total ||
        b.total - a.total ||
        KIND_TIEBREAK[a.kind] - KIND_TIEBREAK[b.kind],
    )[0];
  const strongestRangeStats = [...rangeStats.values()]
    .filter((stats) => stats.total >= 2)
    .sort((a, b) => b.close / b.total - a.close / a.total || b.total - a.total)[0];

  let coaching: string;
  if (directionBias === "high") {
    coaching = "You often landed a little high. Find the midpoint first, then nudge left.";
  } else if (directionBias === "low") {
    coaching = "You often landed a little low. Find the midpoint first, then nudge right.";
  } else if (closeRate >= 0.8 && bestStreak >= 4) {
    coaching = "Excellent number sense. Try the next level up when you are ready.";
  } else if (closeRate >= 0.6) {
    coaching = "You were usually close. Next time watch the midpoint first.";
  } else if (averageError > 0.25) {
    coaching = "Accuracy first, speed second — picture the middle of the line, then adjust.";
  } else {
    coaching = "Solid work. Every estimate makes your mental number line sharper.";
  }

  return {
    trials: n,
    totalPoints,
    averageError,
    closeCount,
    bestStreak,
    coaching,
    directionBias,
    trend,
    lastThreeAverageError,
    strongestKind: strongestKindStats?.kind ?? null,
    strongestKindCloseRate: strongestKindStats ? strongestKindStats.close / strongestKindStats.total : null,
    strongestRange: strongestRangeStats?.range ?? null,
    midpointCloseRate: midpointCount ? midpointCloseCount / midpointCount : null,
  };
}

function averageErrorFor(trials: readonly TrialRecord[]): number {
  return trials.length ? trials.reduce((sum, trial) => sum + trial.error, 0) / trials.length : 0;
}

// ---------------------------------------------------------------------------
// Convenience: band labels for UI (pure data)
// ---------------------------------------------------------------------------

export const BAND_META: Record<
  PlacementBand,
  { label: string; detail: string }
> = {
  g12: { label: "Grades 1–2", detail: "Whole numbers on 0–10, 0–20, 0–100" },
  g34: { label: "Grades 3–4", detail: "Fractions and wholes on 0–1 and 0–2" },
  g56: { label: "Grades 5–6", detail: "Decimals and fractions on 0–1 and 0–10" },
  g78: { label: "Grades 7–8", detail: "Negatives, larger ranges, mixed forms" },
};

export const ALL_BANDS: readonly PlacementBand[] = ["g12", "g34", "g56", "g78"];

/** Session defaults from the design brief. */
export const ROUND_SECONDS = 60;
export const ROUND_MAX_TRIALS = 10;

// Re-export types that UI and tests commonly need from the engine entry.
export type {
  TrialRecord,
  PlacementBand,
  MixedRepresentation,
  NumberKind,
  Target,
  PlacementScore,
  RoundMode,
  RoundSummary,
  TargetIntent,
} from "./types";

export {
  ADAPTIVE_DIRECTIONAL_BIAS_THRESHOLD,
  ADAPTIVE_HOT_ZONE_BIAS_STRENGTH,
  ADAPTIVE_HOT_ZONE_MAX_HALF_WIDTH,
  ADAPTIVE_HOT_ZONE_MIN_HALF_WIDTH,
  ADAPTIVE_HOT_ZONE_PADDING,
  ADAPTIVE_MIN_DECIMAL_OBSERVATIONS,
  ADAPTIVE_MIN_BIASED_TARGETS_PER_QUOTA_WINDOW,
  ADAPTIVE_QUOTA_WINDOW_SIZE,
  ADAPTIVE_WEAK_SIDE_TARGET_PROBABILITY,
  ADAPTIVE_WINDOW_SIZE,
  analyzeRecentTrials,
  deriveAdaptiveBias,
  isAdaptiveTargetIntent,
  sideForNormalizedPosition,
  shouldBiasNextTarget,
} from "./adaptive";
export type { AdaptiveBias, AdaptiveSide, NormalizedHotZone, RecentTrialAnalysis } from "./adaptive";
