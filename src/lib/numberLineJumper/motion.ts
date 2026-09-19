/**
 * Repository-authorized reveal motion contract for GAME-230.
 *
 * The intensity is an accuracy signal, not a second score: exact placements
 * receive the strongest celebration and large errors settle gently.
 */
export const REVEAL_MOTION_TOKENS = {
  intensityErrorSpan: 0.5,
  minScale: 1,
  maxScale: 1.18,
  minGlowBlurPx: 12,
  maxGlowBlurPx: 20,
  minDurationMs: 280,
  maxDurationMs: 360,
  farSettleDurationMs: 420,
  farSettleScale: 1.02,
  easing: "cubic-bezier(0.2, 0.8, 0.2, 1)",
} as const;

export type RevealMotion = {
  intensity: number;
  scale: number;
  glowBlurPx: number;
  durationMs: number;
  farSettleDurationMs: number;
  farSettleScale: number;
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Map relative placement error continuously to an accuracy-correlated intensity. */
export function revealIntensityFromError(error: number): number {
  if (!Number.isFinite(error)) return 0;
  return clamp(1 - Math.max(0, error) / REVEAL_MOTION_TOKENS.intensityErrorSpan, 0, 1);
}

/** Resolve all CSS-facing motion values from the same continuous error signal. */
export function revealMotionFromError(error: number): RevealMotion {
  const intensity = revealIntensityFromError(error);
  const range = REVEAL_MOTION_TOKENS.maxScale - REVEAL_MOTION_TOKENS.minScale;
  const glowRange = REVEAL_MOTION_TOKENS.maxGlowBlurPx - REVEAL_MOTION_TOKENS.minGlowBlurPx;
  const durationRange = REVEAL_MOTION_TOKENS.maxDurationMs - REVEAL_MOTION_TOKENS.minDurationMs;

  return {
    intensity,
    scale: REVEAL_MOTION_TOKENS.minScale + range * intensity,
    glowBlurPx: REVEAL_MOTION_TOKENS.minGlowBlurPx + glowRange * intensity,
    durationMs: Math.round(REVEAL_MOTION_TOKENS.maxDurationMs - durationRange * intensity),
    farSettleDurationMs: REVEAL_MOTION_TOKENS.farSettleDurationMs,
    farSettleScale: REVEAL_MOTION_TOKENS.farSettleScale,
  };
}
