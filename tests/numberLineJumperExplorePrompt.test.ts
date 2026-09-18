import { describe, expect, it } from "vitest";
import { exploreZoomTicks, exploreZoomWindow, mulberry32 } from "@/lib/numberLineJumper/engine";
import { generateExplorePrompt } from "@/lib/numberLineJumper/explorePrompt";

describe("GAME-231 Explore prompt generation", () => {
  it("is deterministic for a seeded session and varies between consecutive prompts", () => {
    const window = exploreZoomWindow(0, 0.5);
    const generateSequence = () => {
      const random = mulberry32(291);
      const prompts: number[] = [];
      for (let index = 0; index < 8; index += 1) {
        prompts.push(generateExplorePrompt(window, random, prompts.at(-1) ?? null));
      }
      return prompts;
    };

    const first = generateSequence();
    expect(generateSequence()).toEqual(first);
    expect(new Set(first).size).toBeGreaterThan(1);
    for (let index = 1; index < first.length; index += 1) {
      expect(first[index]).not.toBe(first[index - 1]);
    }
  });

  it("uses only visible major ticks at every Explore zoom level", () => {
    for (let level = 0; level < 8; level += 1) {
      const window = exploreZoomWindow(level, 0.5);
      const ticks = exploreZoomTicks(window);
      const random = mulberry32(level + 1);
      let previous: number | null = null;

      for (let index = 0; index < 12; index += 1) {
        const prompt = generateExplorePrompt(window, random, previous);
        expect(prompt).toBeGreaterThanOrEqual(window.min);
        expect(prompt).toBeLessThanOrEqual(window.max);
        expect(prompt / ticks.major).toBeCloseTo(Math.round(prompt / ticks.major), 10);
        expect(prompt).not.toBe(previous);
        previous = prompt;
      }
    }
  });

  it("handles random sources at their endpoints without selecting past the tick list", () => {
    const window = exploreZoomWindow(1, 0.5);
    const ticks = exploreZoomTicks(window).majorTicks.filter(
      (value) => value >= window.min && value <= window.max,
    );

    expect(generateExplorePrompt(window, () => 0)).toBe(ticks[0]);
    expect(generateExplorePrompt(window, () => 1)).toBe(ticks.at(-1));
  });

  it("normalizes non-finite and out-of-range random samples and reuses a sole tick", () => {
    const window = { min: 5, max: 5 };
    expect(generateExplorePrompt(window, () => Number.NaN)).toBe(5);
    expect(generateExplorePrompt(window, () => -1)).toBe(5);
    expect(generateExplorePrompt(window, () => 1, 5)).toBe(5);
  });

  it("rejects a window with no finite major ticks", () => {
    expect(() => generateExplorePrompt({ min: Number.NaN, max: Number.NaN }, () => 0)).toThrow(RangeError);
  });
});
