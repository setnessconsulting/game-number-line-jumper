import { describe, expect, it } from "vitest";
import {
  ariaValueText,
  formatNumberValue,
  generateTarget,
  mulberry32,
  targetRevealAnnouncement,
  valueAtPosition,
} from "@/lib/numberLineJumper/engine";
import type { PlacementBand, Target } from "@/lib/numberLineJumper/types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const NEGATIVE_RANGE = { min: -10, max: 10 } as const;

/** True when `text` uses the engine's U+2212 minus (no ASCII hyphen allowed). */
function hasAsciiHyphen(text: string): boolean {
  return text.includes("-");
}

function genTarget(band: PlacementBand, seed: number): Target {
  return generateTarget(band, mulberry32(seed));
}

// ---------------------------------------------------------------------------
// formatNumberValue — the stable numeric copy for visible and SR readouts
// ---------------------------------------------------------------------------

describe("formatNumberValue — sign and zero contract", () => {
  it("writes negatives with the U+2212 minus and never an ASCII hyphen", () => {
    expect(formatNumberValue(-4)).toBe("−4");
    expect(formatNumberValue(-0.5)).toBe("−0.5");
    for (const value of [-10, -3, -0.25, -0.001]) {
      expect(hasAsciiHyphen(formatNumberValue(value))).toBe(false);
    }
  });

  it("snaps sub-hundredth magnitudes to plain 0, never a signed zero", () => {
    expect(formatNumberValue(0)).toBe("0");
    expect(formatNumberValue(0.004)).toBe("0");
    expect(formatNumberValue(-0.004)).toBe("0");
    expect(formatNumberValue(-0)).toBe("0");
    for (const value of [0.004, -0.004]) {
      const text = formatNumberValue(value);
      expect(text).not.toContain("−0");
      expect(text).not.toBe("-0");
    }
  });

  it("keeps one-hundredth-scale magnitudes signed and precise", () => {
    expect(formatNumberValue(0.005)).toBe("0.01");
    expect(formatNumberValue(-0.005)).toBe("−0.01");
    expect(formatNumberValue(0.01)).toBe("0.01");
    expect(formatNumberValue(-0.01)).toBe("−0.01");
  });

  it("trims trailing zeros without losing the integer/decimal distinction", () => {
    expect(formatNumberValue(2)).toBe("2");
    expect(formatNumberValue(2.5)).toBe("2.5");
    expect(formatNumberValue(2.5)).not.toBe("2.50");
    expect(formatNumberValue(0.7)).toBe("0.7");
    expect(formatNumberValue(500)).toBe("500");
  });
});

// ---------------------------------------------------------------------------
// ariaValueText — the per-trial slider announcement (g78 is the negative band)
// ---------------------------------------------------------------------------

describe("ariaValueText on the negative band", () => {
  it("announces the midpoint of −10…10 as plain 0 with the full window", () => {
    expect(ariaValueText(0.5, NEGATIVE_RANGE)).toBe("0 on a line from −10 to 10");
  });

  it("announces negative placements with U+2212 and the correct value", () => {
    expect(ariaValueText(0.25, NEGATIVE_RANGE)).toBe("−5 on a line from −10 to 10");
    expect(ariaValueText(0.4, NEGATIVE_RANGE)).toBe("−2 on a line from −10 to 10");
    expect(ariaValueText(0.74, NEGATIVE_RANGE)).toBe("4.8 on a line from −10 to 10");
  });

  it("never announces a signed zero for sub-hundredth marker positions", () => {
    // 0.4998 on −10…10 is −0.004 — the exact value class reachable by a drag.
    const text = ariaValueText(0.4998, NEGATIVE_RANGE);
    expect(text.startsWith("0 on a line from")).toBe(true);
    expect(text).not.toContain("−0");
    expect(text).not.toContain("-0");
    // One norm step further is −0.02 and must stay signed.
    expect(ariaValueText(0.499, NEGATIVE_RANGE).startsWith("−0.02 on a line from")).toBe(true);
  });

  it("clamps out-of-range norms to the announced endpoints", () => {
    expect(ariaValueText(-0.5, NEGATIVE_RANGE)).toBe("−10 on a line from −10 to 10");
    expect(ariaValueText(1.5, NEGATIVE_RANGE)).toBe("10 on a line from −10 to 10");
  });

  it("keeps the announcement clean across a dense sweep of placements", () => {
    for (let i = 0; i <= 2000; i += 1) {
      const text = ariaValueText(i / 2000, NEGATIVE_RANGE);
      expect(hasAsciiHyphen(text), `ASCII hyphen in ${text}`).toBe(false);
      expect(text).not.toContain("NaN");
      expect(text.startsWith("−0 ")).toBe(false);
      expect(text.startsWith("-0 ")).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// targetRevealAnnouncement — the warm-up reveal copy
// ---------------------------------------------------------------------------

describe("targetRevealAnnouncement across kinds and signs", () => {
  it("announces negative targets with U+2212 and their percent position", () => {
    const target: Target = {
      value: -4,
      display: "−4",
      kind: "negative",
      range: { min: -10, max: 10 },
    };
    // (−4 − (−10)) / 20 = 0.3 → 30 percent.
    expect(targetRevealAnnouncement(target)).toBe("The example target −4 is at 30 percent across the line.");
  });

  it("announces decimal and whole targets without ASCII hyphens", () => {
    const decimal: Target = {
      value: 0.7,
      display: "0.7",
      kind: "decimal",
      range: { min: 0, max: 1 },
    };
    expect(targetRevealAnnouncement(decimal)).toBe("The example target 0.7 is at 70 percent across the line.");

    const whole: Target = {
      value: 47,
      display: "47",
      kind: "whole",
      range: { min: 0, max: 100 },
    };
    expect(targetRevealAnnouncement(whole)).toBe("The example target 47 is at 47 percent across the line.");
  });

  it("lands a zero-valued target on the midpoint announcement, never −0 or NaN", () => {
    const zero: Target = {
      value: 0,
      display: "0",
      kind: "whole",
      range: { min: -10, max: 10 },
    };
    const text = targetRevealAnnouncement(zero);
    expect(text).toBe("The example target 0 is at 50 percent across the line.");
    expect(text).not.toContain("−0");
    expect(text).not.toContain("NaN");
  });
});

// ---------------------------------------------------------------------------
// Seeded generation — announced value must agree with the visible display
// ---------------------------------------------------------------------------

describe("announced value agrees with the visible target display", () => {
  // Fractions are excluded by design: their display is "a/b" (or mixed), while
  // the announcement states the numeric value. Every other kind displays its
  // own value, so both audiences must read the same number and sign.
  const bands: readonly PlacementBand[] = ["g12", "g56", "g78"];

  for (const band of bands) {
    it(`keeps formatNumberValue(value) === display for ${band} targets across seeds`, () => {
      for (let seed = 0; seed < 400; seed += 1) {
        const target = genTarget(band, 500_000 + seed);
        if (target.kind === "fraction") continue;
        expect(formatNumberValue(target.value), `${band} seed ${seed}`).toBe(target.display);
      }
    });

    it(`keeps the announced first token equal to the display for ${band}`, () => {
      for (let seed = 0; seed < 400; seed += 1) {
        const target = genTarget(band, 600_000 + seed);
        if (target.kind === "fraction") continue;
        const announced = ariaValueText(
          (target.value - target.range.min) / (target.range.max - target.range.min),
          target.range,
        );
        expect(announced.startsWith(`${target.display} on a line from`), `${band} seed ${seed}: ${announced}`).toBe(true);
      }
    });

    it(`keeps reveal-announcement copy consistent with the display for ${band}`, () => {
      for (let seed = 0; seed < 200; seed += 1) {
        const target = genTarget(band, 700_000 + seed);
        if (target.kind === "fraction") continue;
        const text = targetRevealAnnouncement(target);
        expect(text, `${band} seed ${seed}`).toContain(`target ${target.display} is at`);
      }
    });
  }

  it("keeps generated g78 readouts free of ASCII hyphens and signed zeros", () => {
    for (let seed = 0; seed < 400; seed += 1) {
      const target = genTarget("g78", 800_000 + seed);
      if (target.kind === "fraction") continue;
      expect(hasAsciiHyphen(target.display), `display ${target.display}`).toBe(false);
      expect(target.display).not.toBe("−0");
      const norm = (target.value - target.range.min) / (target.range.max - target.range.min);
      expect(hasAsciiHyphen(ariaValueText(norm, target.range))).toBe(false);
    }
  });

  it("places exactly at the announced value on the negative band", () => {
    // Round-trip guard tying valueAtPosition to the announced copy.
    for (const [norm, expectedStart] of [
      [0.25, "−5"],
      [0.5, "0"],
      [0.75, "5"],
    ] as const) {
      const value = valueAtPosition(norm, NEGATIVE_RANGE);
      expect(ariaValueText(norm, NEGATIVE_RANGE).startsWith(`${expectedStart} on a line from`)).toBe(true);
      expect(formatNumberValue(value)).toBe(expectedStart);
    }
  });
});
