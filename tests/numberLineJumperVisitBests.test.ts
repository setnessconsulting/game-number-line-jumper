import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { summarizeRound } from "@/lib/numberLineJumper/engine";
import type { RoundSummary, TrialRecord } from "@/lib/numberLineJumper/types";
import {
  firstVisitBests,
  recordCallouts,
  sessionBestsLine,
  sessionRecordCallouts,
  updateVisitBests,
  visitBestsLine,
} from "@/lib/numberLineJumper/visitBests";

// ---------------------------------------------------------------------------
// Helpers — summaries built through the authoritative summarizeRound path
// ---------------------------------------------------------------------------

function summaryFor(averageError: number, bestStreak: number): RoundSummary {
  // Build an honest trial set: `bestStreak` close trials plus one far trial,
  // with errors chosen so the run's average error is exactly `averageError`.
  // (A far tail also mirrors real runs, where the closing streak is what counts.)
  const closeError = 0.1; // "close" tier: ≤ 15 %
  const farError = Math.max(0.16, averageError * (bestStreak + 1) - closeError * bestStreak);
  const trials: TrialRecord[] = [];
  for (let i = 0; i < bestStreak; i += 1) {
    trials.push({ error: closeError, closeness: "close", points: 6 });
  }
  trials.push({ error: farError, closeness: "far", points: 2 });
  const summary = summarizeRound(trials);
  expect(summary.averageError).toBeCloseTo(averageError, 10);
  expect(summary.bestStreak).toBe(bestStreak);
  return summary;
}

const FIRST = summaryFor(0.2, 3);

// ---------------------------------------------------------------------------
// LEVELBEST-57 AC: session-only personal bests on the NLJ summary
// ---------------------------------------------------------------------------

describe("visit bests — first run establishes the baselines", () => {
  it("a first completed run sets both visit bests without new-record flags", () => {
    const { bests, delta } = updateVisitBests(null, FIRST);
    expect(bests).toEqual({ averageError: 0.2, closeStreak: 3 });
    // The first run establishes records silently — nothing was beaten yet.
    expect(delta).toEqual({ averageError: false, closeStreak: false });
  });

  it("firstVisitBests copies the authoritative summary metrics without recalculation", () => {
    expect(firstVisitBests(FIRST)).toEqual({ averageError: FIRST.averageError, closeStreak: FIRST.bestStreak });
  });
});

describe("visit bests — subsequent runs", () => {
  it("a worse result does not overwrite an existing best", () => {
    const worse = summaryFor(0.3, 2);
    const { bests, delta } = updateVisitBests({ averageError: 0.2, closeStreak: 3 }, worse);
    expect(bests).toEqual({ averageError: 0.2, closeStreak: 3 });
    expect(delta).toEqual({ averageError: false, closeStreak: false });
  });

  it("a lower average error updates the best average error", () => {
    const improvedError = { ...FIRST, averageError: 0.15 };
    const { bests, delta } = updateVisitBests({ averageError: 0.2, closeStreak: 3 }, improvedError);
    expect(bests?.averageError).toBe(0.15);
    expect(bests?.closeStreak).toBe(3);
    expect(delta).toEqual({ averageError: true, closeStreak: false });
  });

  it("a longer close streak updates the best close streak", () => {
    const improvedStreak = { ...FIRST, bestStreak: 5 };
    const { bests, delta } = updateVisitBests({ averageError: 0.2, closeStreak: 3 }, improvedStreak);
    expect(bests?.averageError).toBe(0.2);
    expect(bests?.closeStreak).toBe(5);
    expect(delta).toEqual({ averageError: false, closeStreak: true });
  });

  it("both records can improve simultaneously", () => {
    const improvedBoth = { ...FIRST, averageError: 0.1, bestStreak: 6 };
    const { bests, delta } = updateVisitBests({ averageError: 0.2, closeStreak: 3 }, improvedBoth);
    expect(bests).toEqual({ averageError: 0.1, closeStreak: 6 });
    expect(delta).toEqual({ averageError: true, closeStreak: true });
  });

  it("mixed runs keep each metric independent (one up, one down)", () => {
    const run = { ...FIRST, averageError: 0.25, bestStreak: 4 };
    const { bests, delta } = updateVisitBests({ averageError: 0.2, closeStreak: 3 }, run);
    expect(bests).toEqual({ averageError: 0.2, closeStreak: 4 });
    expect(delta).toEqual({ averageError: false, closeStreak: true });
  });
});

describe("visit bests — tie behavior (deliberate)", () => {
  it("an equal average error is steady work, not a new record", () => {
    const tie = { ...FIRST, averageError: 0.2 };
    const { bests, delta } = updateVisitBests({ averageError: 0.2, closeStreak: 3 }, tie);
    expect(bests?.averageError).toBe(0.2);
    expect(delta.averageError).toBe(false);
  });

  it("an equal close streak is not flagged as a new record", () => {
    const tie = { ...FIRST, bestStreak: 3 };
    const { bests, delta } = updateVisitBests({ averageError: 0.2, closeStreak: 3 }, tie);
    expect(bests?.closeStreak).toBe(3);
    expect(delta.closeStreak).toBe(false);
  });

  it("ties on both metrics produce no callout copy at all", () => {
    const tie = { ...FIRST, averageError: 0.2, bestStreak: 3 };
    const { delta } = updateVisitBests({ averageError: 0.2, closeStreak: 3 }, tie);
    expect(recordCallouts(delta, tie)).toEqual([]);
  });
});

describe("visit bests — zero/empty-state rounds", () => {
  it("a zero-trial round never creates or changes the records", () => {
    const empty = summarizeRound([]);
    const fromNull = updateVisitBests(null, empty);
    expect(fromNull.bests).toBeNull();
    expect(fromNull.delta).toEqual({ averageError: false, closeStreak: false });

    const existing = updateVisitBests({ averageError: 0.2, closeStreak: 3 }, empty);
    expect(existing.bests).toEqual({ averageError: 0.2, closeStreak: 3 });
    expect(existing.delta).toEqual({ averageError: false, closeStreak: false });
  });
});

describe("visit bests — new-record messaging", () => {
  it("appears only when a record actually improved", () => {
    const improved = recordCallouts({ averageError: true, closeStreak: false }, { ...FIRST, averageError: 0.15 });
    expect(improved).toHaveLength(1);
    expect(improved[0]).toContain("New best average error this visit");

    const none = recordCallouts({ averageError: false, closeStreak: false }, FIRST);
    expect(none).toEqual([]);
  });

  it("names both records when both improve in one run", () => {
    const lines = recordCallouts({ averageError: true, closeStreak: true }, { ...FIRST, averageError: 0.1, bestStreak: 5 });
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain("New best average error this visit");
    expect(lines[1]).toContain("New best close streak this visit");
  });

  it("reports the just-completed run's values, not the stored bests", () => {
    const lines = recordCallouts({ averageError: true, closeStreak: false }, { ...FIRST, averageError: 0.123 });
    expect(lines[0]).toContain("12.3%");
  });
});

describe("session bests — browser-tab copy", () => {
  it("uses tab lifetime language for a stored best", () => {
    expect(sessionBestsLine({ averageError: 0.2, closeStreak: 3 })).toContain("Best this session");
    expect(sessionBestsLine({ averageError: 0.2, closeStreak: 3 })).toContain("close this tab");
    expect(sessionBestsLine(null)).toBeNull();
  });

  it("names the session scope when a stored record improves", () => {
    const lines = sessionRecordCallouts({ averageError: true, closeStreak: true }, { ...FIRST, averageError: 0.1, bestStreak: 5 });
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain("this session");
    expect(lines[1]).toContain("this session");
    expect(sessionRecordCallouts({ averageError: false, closeStreak: false }, FIRST)).toEqual([]);
    expect(sessionRecordCallouts({ averageError: true, closeStreak: false }, { ...FIRST, averageError: 0.1 })).toHaveLength(1);
    expect(sessionRecordCallouts({ averageError: false, closeStreak: true }, { ...FIRST, bestStreak: 5 })).toHaveLength(1);
  });
});

describe("visit bests — coaching-voice copy contract", () => {
  const NON_SHAMING_FORBIDDEN = [
    /beat(en|ing)?\s+(your\s+)??(record|score|best)/i,
    /\b(failed|failure|worse|worst|weak|shame|bad luck|lost|losing|slow)\b/i,
    /\b(leaderboard|rank|compete|competition|versus|others|players)\b/i,
    /\b(account|profile|sign\s?in|log\s?in)\b/i,
    /\b(forever|permanent|all\s+time)\b/i,
  ];

  function allVisitCopy(): string[] {
    const summaries = [
      FIRST,
      { ...FIRST, averageError: 0.05, bestStreak: 8 },
      { ...FIRST, averageError: 0.4, bestStreak: 0 },
    ];
    const lines: string[] = [];
    for (const summary of summaries) {
      lines.push(...recordCallouts({ averageError: true, closeStreak: true }, summary));
      lines.push(...recordCallouts({ averageError: true, closeStreak: false }, summary));
      lines.push(...recordCallouts({ averageError: false, closeStreak: true }, summary));
      const bests = firstVisitBests(summary);
      const line = visitBestsLine(bests);
      if (line) lines.push(line);
    }
    return lines;
  }

  it("stays positive, non-shaming, and free of competitive framing", () => {
    for (const line of allVisitCopy()) {
      for (const pattern of NON_SHAMING_FORBIDDEN) {
        expect(line, `"${line}" must not match ${pattern}`).not.toMatch(pattern);
      }
    }
  });

  it("always scopes records to this visit and says they clear on reload", () => {
    for (const summary of [FIRST, { ...FIRST, averageError: 0.05, bestStreak: 8 }]) {
      const line = visitBestsLine(firstVisitBests(summary));
      expect(line).toContain("this visit");
      expect(line).toContain("clears when you reload");
    }
  });

  it("callouts always name the visit scope", () => {
    for (const summary of [FIRST, { ...FIRST, averageError: 0.05, bestStreak: 8 }]) {
      for (const line of recordCallouts({ averageError: true, closeStreak: true }, summary)) {
        expect(line).toContain("this visit");
      }
    }
  });

  it("hides the visit-bests line entirely before a first completed run", () => {
    expect(visitBestsLine(null)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Session-only architecture guards (source-level)
// ---------------------------------------------------------------------------

describe("visit bests — session-only architecture", () => {
  const ROOT = process.cwd();
  const VISIT_MODULE = join(ROOT, "src", "lib", "numberLineJumper", "visitBests.ts");
  const SHELL = join(ROOT, "src", "app", "games", "NumberLineJumper.tsx");

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

  it("holds visit bests in React state initialized empty on every mount", () => {
    const shell = readFileSync(SHELL, "utf8");
    expect(shell).toContain("useState<VisitBests | null>(null)");
    // No ref-less persistence: the visit bests come only from updateVisitBests.
    expect(shell).toContain("visitBestsRef.current = result.bests");
  });

  it("stores only the two run metrics — no child identity of any kind", () => {
    const source = readFileSync(VISIT_MODULE, "utf8");
    const FORBIDDEN_IDENTITY = [/child/i, /userId/i, /user_id/i, /learner/i, /name/i, /email/i, /id\s*:/];
    for (const pattern of FORBIDDEN_IDENTITY) {
      expect(source, `visitBests.ts must not mention identity (${pattern})`).not.toMatch(pattern);
    }
    expect(source).toMatch(/averageError: number/);
    expect(source).toMatch(/closeStreak: number/);
  });

  it("contains no storage or network persistence in the visit-bests path", () => {
    for (const file of [VISIT_MODULE, SHELL]) {
      const contents = readFileSync(file, "utf8");
      for (const pattern of FORBIDDEN) {
        expect(contents, `${file} must not match ${pattern}`).not.toMatch(pattern);
      }
    }
  });

  it("reuses the authoritative summarizeRound metrics instead of duplicating stat math", () => {
    const source = readFileSync(VISIT_MODULE, "utf8");
    expect(source).toContain("summary.averageError");
    expect(source).toContain("summary.bestStreak");
    expect(source).not.toMatch(/errorSum|reduce\(/);
  });
});
