import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const FILES = [
  "src/app/games/NumberLineJumper.tsx",
  "src/lib/numberLineJumper/engine.ts",
  "src/lib/numberLineJumper/adaptive.ts",
  // LEVELBEST-61: the session aggregate contract stays page-session memory.
  "src/lib/numberLineJumper/aggregates.ts",
  "src/lib/numberLineJumper/sound.ts",
  // LEVELBEST-57: session-only visit bests must stay page-session memory.
  "src/lib/numberLineJumper/visitBests.ts",
];

const FORBIDDEN = [
  /localStorage/,
  /sessionStorage/,
  /indexedDB/,
  /document\.cookie/,
  /\bfetch\s*\(/,
  /\bXMLHttpRequest\b/,
  /\bWebSocket\s*\(/,
  /\bEventSource\s*\(/,
  /navigator\.sendBeacon/,
];

describe("Number Line Jumper privacy boundary", () => {
  it("keeps game state, sound cues, and visit bests local to the current browser session", () => {
    const violations: string[] = [];
    for (const file of FILES) {
      const contents = readFileSync(file, "utf8");
      for (const pattern of FORBIDDEN) {
        if (pattern.test(contents)) violations.push(`${file}: matched ${pattern}`);
      }
    }
    expect(violations).toEqual([]);
  });

  it("keeps the adaptive engine on the seeded deterministic path", () => {
    for (const file of ["src/lib/numberLineJumper/adaptive.ts", "src/lib/numberLineJumper/engine.ts"]) {
      const contents = readFileSync(file, "utf8");
      expect(contents, `${file} must not use ambient randomness or time`).not.toMatch(/Math\.random|Date\.now|new Date\s*\(/);
    }
  });

  it("initializes visit bests empty on every mount so a reload starts a fresh visit", () => {
    const shell = readFileSync("src/app/games/NumberLineJumper.tsx", "utf8");
    // Page-session memory only: the records begin null on each mount and are
    // never hydrated from storage (there is no storage call to hydrate from).
    expect(shell).toContain("useState<VisitBests | null>(null)");
    expect(shell).not.toMatch(/visitBests.*(localStorage|sessionStorage|cookie)/i);
  });
});
