import { describe, expect, it } from "vitest";
import {
  ariaValueText,
  EXPLORE_ZOOM_ANCHOR,
  EXPLORE_ZOOM_LEVELS,
  exploreZoomNormForValue,
  exploreZoomPan,
  exploreZoomTicks,
  exploreZoomWindow,
  scorePlacement,
  targetRevealAnnouncement,
  valueAtPosition,
} from "@/lib/numberLineJumper/engine";

describe("GAME-5 zoomable Explore — scale math", () => {
  it("anchors level 0 on the full -10...1000 span", () => {
    const window = exploreZoomWindow(0, 0.5);
    expect(window).toEqual({ min: -10, max: 1000 });
    expect(window.max - window.min).toBe(1010);
  });

  it("narrows one power-of-10 step per level down to a span-10 floor", () => {
    const spans = Array.from({ length: EXPLORE_ZOOM_LEVELS }, (_, level) =>
      exploreZoomWindow(level, 0.5).max - exploreZoomWindow(level, 0.5).min,
    );
    expect(spans[0]).toBe(1010);
    expect(spans[1]).toBeCloseTo(101, 10);
    expect(spans[2]).toBeCloseTo(10.1, 10);
    for (let i = 3; i < spans.length; i += 1) expect(spans[i]).toBe(10);
    for (let i = 1; i < spans.length; i += 1) expect(spans[i]).toBeLessThanOrEqual(spans[i - 1]);
  });

  it("clamps fractional, negative, and oversized levels into range", () => {
    expect(exploreZoomWindow(-3, 0.5)).toEqual(exploreZoomWindow(0, 0.5));
    expect(exploreZoomWindow(99, 0.5)).toEqual(exploreZoomWindow(EXPLORE_ZOOM_LEVELS - 1, 0.5));
    expect(exploreZoomWindow(1.9, 0.5)).toEqual(exploreZoomWindow(1, 0.5));
  });

  it("preserves the jumper value across zoom when the window still contains it", () => {
    const previous = exploreZoomWindow(1, 0.5);
    const value = valueAtPosition(0.5, previous);
    const next = exploreZoomWindow(3, 0.5, previous);
    expect(exploreZoomNormForValue(value, next)).toBeGreaterThan(0);
    expect(exploreZoomNormForValue(value, next)).toBeLessThan(1);
    expect(valueAtPosition(exploreZoomNormForValue(value, next), next)).toBeCloseTo(value, 10);
  });

  it("round-trips value <-> norm on every level without NaN", () => {
    for (let level = 0; level < EXPLORE_ZOOM_LEVELS; level += 1) {
      const window = exploreZoomWindow(level, 0.5);
      for (const norm of [0, 0.25, 0.5, 0.75, 1]) {
        const value = valueAtPosition(norm, window);
        expect(Number.isFinite(value)).toBe(true);
        expect(exploreZoomNormForValue(value, window)).toBeCloseTo(norm, 10);
      }
    }
  });
});

describe("GAME-5 zoomable Explore — tick subdivision", () => {
  it("uses power-of-10 major steps with one decimal subdivision", () => {
    const full = exploreZoomTicks({ min: -10, max: 1000 });
    expect(full.major).toBe(100);
    expect(full.minor).toBe(10);
    expect(full.majorTicks).toEqual([-0, 100, 200, 300, 400, 500, 600, 700, 800, 900, 1000].map((t) => (Object.is(t, -0) ? 0 : t)));

    const close = exploreZoomTicks({ min: 495, max: 505 });
    expect(close.major).toBe(1);
    expect(close.minor).toBe(0.1);
    expect(close.majorTicks).toContain(500);
    expect(close.majorTicks.length).toBeLessThanOrEqual(12);
  });

  it("keeps at most 10 major intervals with readable decimal labels", () => {
    for (let level = 0; level < EXPLORE_ZOOM_LEVELS; level += 1) {
      const window = exploreZoomWindow(level, 0.5);
      const { major, minor, majorTicks } = exploreZoomTicks(window);
      expect(major).toBeGreaterThan(0);
      expect(minor).toBeCloseTo(major / 10, 12);
      expect(majorTicks.length).toBeGreaterThan(0);
      expect(majorTicks.length).toBeLessThanOrEqual(12);
      for (const tick of majorTicks) {
        expect(tick).toBeGreaterThanOrEqual(window.min - major / 2);
        expect(tick).toBeLessThanOrEqual(window.max + major / 2);
      }
    }
  });

  it("fails closed on degenerate windows", () => {
    const ticks = exploreZoomTicks({ min: 5, max: 5 });
    expect(Number.isFinite(ticks.major)).toBe(true);
    expect(ticks.major).toBeGreaterThan(0);
    expect(ticks.minor).toBeCloseTo(ticks.major / 10, 12);
  });
});

describe("GAME-5 zoomable Explore — pan", () => {
  it("moves half a span and never leaves the -10...1000 anchor", () => {
    const window = exploreZoomWindow(3, 0.5);
    const span = window.max - window.min;
    const right = exploreZoomPan(window, 1);
    expect(right.max - right.min).toBeCloseTo(span, 10);
    expect(right.min).toBeCloseTo(window.min + span / 2, 10);
    const left = exploreZoomPan(window, -1);
    expect(left.min).toBeCloseTo(window.min - span / 2, 10);

    // Clamp at the anchor edges.
    const edge = { min: EXPLORE_ZOOM_ANCHOR.max - span, max: EXPLORE_ZOOM_ANCHOR.max };
    expect(exploreZoomPan(edge, 1)).toEqual(edge);
    const start = { min: EXPLORE_ZOOM_ANCHOR.min, max: EXPLORE_ZOOM_ANCHOR.min + span };
    expect(exploreZoomPan(start, -1)).toEqual(start);
  });

  it("preserves span exactly and never mutates the input", () => {
    const window = exploreZoomWindow(2, 0.3);
    const snapshot = { ...window };
    const next = exploreZoomPan(window, 1);
    expect(window).toEqual(snapshot);
    expect(next.max - next.min).toBeCloseTo(snapshot.max - snapshot.min, 12);
  });
});

describe("GAME-5 zoomable Explore — readout contract", () => {
  it("aria text always names the visible window, never a stale preset range", () => {
    for (let level = 0; level < EXPLORE_ZOOM_LEVELS; level += 1) {
      const window = exploreZoomWindow(level, 0.5);
      const text = ariaValueText(0.5, window);
      expect(text).toContain("on a line from");
      expect(text).not.toContain("NaN");
    }
    const deep = exploreZoomWindow(EXPLORE_ZOOM_LEVELS - 1, 0.5);
    expect(ariaValueText(0, deep)).toContain("on a line from");
    expect(ariaValueText(1, deep)).toContain("on a line from");
  });

  it("degenerate norm mapping lands on the midpoint, never NaN", () => {
    expect(exploreZoomNormForValue(5, { min: 5, max: 5 })).toBe(0.5);
    expect(exploreZoomNormForValue(Number.NaN, { min: 0, max: 10 })).toBe(0.5);
  });

  it("keeps zero-span reveal, scoring, and zoom fallbacks finite", () => {
    const point = { min: 5, max: 5 };
    const target = { value: 5, display: "5", kind: "whole" as const, range: point };

    expect(targetRevealAnnouncement(target)).toContain("50 percent");
    expect(scorePlacement(0.8, target)).toMatchObject({ error: 0, targetNormalized: 0.5, direction: "spot" });
    expect(exploreZoomWindow(1, 0.5, point)).toEqual(exploreZoomWindow(1, 0.5, { min: 7, max: 7 }));
    expect(exploreZoomPan(point, 1)).toEqual(EXPLORE_ZOOM_ANCHOR);
    expect(exploreZoomPan({ min: Number.NaN, max: Number.NaN }, -1)).toEqual(EXPLORE_ZOOM_ANCHOR);
  });
});
