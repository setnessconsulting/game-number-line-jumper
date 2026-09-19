import { describe, expect, it } from "vitest";

import {
  REVEAL_MOTION_TOKENS,
  revealIntensityFromError,
  revealMotionFromError,
} from "@/lib/numberLineJumper/motion";

describe("GAME-230 reveal motion", () => {
  it("maps relative error continuously to an accuracy intensity", () => {
    expect(revealIntensityFromError(0)).toBe(1);
    expect(revealIntensityFromError(0.25)).toBe(0.5);
    expect(revealIntensityFromError(0.5)).toBe(0);
    expect(revealIntensityFromError(0.9)).toBe(0);
    expect(revealIntensityFromError(-0.1)).toBe(1);
    expect(revealIntensityFromError(Number.NaN)).toBe(0);
  });

  it("produces visibly different motion tokens for different errors", () => {
    const exact = revealMotionFromError(0.02);
    const far = revealMotionFromError(0.35);

    expect(exact.intensity).toBeGreaterThan(far.intensity);
    expect(exact.scale).toBeGreaterThan(far.scale);
    expect(exact.glowBlurPx).toBeGreaterThan(far.glowBlurPx);
    expect(exact.durationMs).toBeLessThan(far.durationMs);
    expect(exact.farSettleDurationMs).toBe(REVEAL_MOTION_TOKENS.farSettleDurationMs);
    expect(exact.farSettleScale).toBe(REVEAL_MOTION_TOKENS.farSettleScale);
  });

  it("keeps motion values within the documented bounds", () => {
    const values = [revealMotionFromError(0), revealMotionFromError(0.1), revealMotionFromError(1)];

    for (const value of values) {
      expect(value.scale).toBeGreaterThanOrEqual(REVEAL_MOTION_TOKENS.minScale);
      expect(value.scale).toBeLessThanOrEqual(REVEAL_MOTION_TOKENS.maxScale);
      expect(value.glowBlurPx).toBeGreaterThanOrEqual(REVEAL_MOTION_TOKENS.minGlowBlurPx);
      expect(value.glowBlurPx).toBeLessThanOrEqual(REVEAL_MOTION_TOKENS.maxGlowBlurPx);
      expect(value.durationMs).toBeGreaterThanOrEqual(REVEAL_MOTION_TOKENS.minDurationMs);
      expect(value.durationMs).toBeLessThanOrEqual(REVEAL_MOTION_TOKENS.maxDurationMs);
    }
  });
});
