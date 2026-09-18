import { mkdirSync, writeFileSync } from "node:fs";
import { expect, test } from "../browserErrorFixture";
import type { CDPSession, Page } from "@playwright/test";

type MoveMetric = { latencyMs: number; changed: boolean };
type PerfState = {
  moves: MoveMetric[];
  longTasks: number[];
  revealTransitions: number[];
};

const performanceDirectory = "performance-results";

function p95(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  if (sorted.length === 0) throw new Error("Cannot calculate p95 of an empty sample.");
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1)]!;
}

async function openExplore(page: Page) {
  await page.goto("/");
  await expect(page.getByText(/Number Line Jumper · pick your level/)).toBeVisible();
  await page.getByRole("button", { name: "Explore an untimed line" }).click();
  await expect(page.getByRole("slider", { name: /Explore number line/ })).toBeVisible();
}

async function openChallenge(page: Page) {
  await page.goto("/");
  await expect(page.getByText(/Number Line Jumper · pick your level/)).toBeVisible();
  await page.locator('input[name="number-line-mode"][value="challenge"]').check();
  await page.getByRole("button", { name: /Grades 3/ }).click();
  await expect(page.getByRole("slider")).toBeVisible();
}

async function installPerformanceObservers(page: Page) {
  await page.evaluate(() => {
    const targetWindow = window as typeof window & { __nlPerf?: PerfState };
    targetWindow.__nlPerf = { moves: [], longTasks: [], revealTransitions: [] };

    try {
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) targetWindow.__nlPerf!.longTasks.push(entry.duration);
      });
      observer.observe({ type: "longtask", buffered: false });
    } catch {
      // Long Task API is Chromium-only in this qualification lane.
    }

    const track = document.querySelector<HTMLElement>(".nl-track-explore");
    if (!track) throw new Error("Explore track is missing.");
    track.addEventListener("pointermove", (event) => {
      const marker = track.querySelector<HTMLElement>(".nl-marker");
      if (!marker) return;
      const before = marker.style.getPropertyValue("--nl-pos");
      const eventTimestamp = event.timeStamp;
      let frames = 0;
      const sample = () => {
        requestAnimationFrame(() => {
          frames += 1;
          const after = marker.style.getPropertyValue("--nl-pos");
          if (after !== before || frames >= 2) {
            targetWindow.__nlPerf!.moves.push({
              latencyMs: Math.max(0, performance.now() - eventTimestamp),
              changed: after !== before,
            });
          } else {
            sample();
          }
        });
      };
      sample();
    });
  });
}

async function dragSamples(page: Page, count = 220) {
  const track = page.locator(".nl-track-explore");
  const box = await track.boundingBox();
  if (!box) throw new Error("Explore track has no bounding box.");
  const y = box.y + box.height / 2;
  await page.mouse.move(box.x + 18, y);
  await page.mouse.down();
  for (let index = 0; index < count; index += 1) {
    const fraction = index % 2 === 0
      ? 0.12 + (index % 40) / 50
      : 0.88 - (index % 40) / 50;
    await page.mouse.move(box.x + Math.max(18, Math.min(box.width - 18, box.width * fraction)), y);
  }
  await page.mouse.up();
  await page.waitForFunction((minimum) => {
    const state = (window as typeof window & { __nlPerf?: PerfState }).__nlPerf;
    return (state?.moves.length ?? 0) >= minimum;
  }, Math.floor(count * 0.75));
}

async function readState(page: Page): Promise<PerfState> {
  return page.evaluate(() => {
    const state = (window as typeof window & { __nlPerf?: PerfState }).__nlPerf;
    if (!state) throw new Error("Performance state is missing.");
    return state;
  });
}

test.describe("GAME-219 rendering and performance qualification", () => {
  test("anchors Explore tick labels to their mathematical tick positions", async ({ page }) => {
    await openExplore(page);
    await page.getByRole("button", { name: "Zoom in" }).click();
    await page.getByRole("button", { name: "Zoom in" }).click();

    const labels = page.locator(".nl-tick-label");
    const ticks = page.locator(".nl-zoom-tick");
    await expect(labels).toHaveCount(await ticks.count());

    const count = await labels.count();
    expect(count).toBeGreaterThan(2);
    for (let index = 0; index < count; index += 1) {
      const labelBox = await labels.nth(index).boundingBox();
      const tickBox = await ticks.nth(index).boundingBox();
      expect(labelBox, `label ${index} should render`).not.toBeNull();
      expect(tickBox, `tick ${index} should render`).not.toBeNull();
      const labelCenter = labelBox!.x + labelBox!.width / 2;
      const tickCenter = tickBox!.x + tickBox!.width / 2;
      expect(Math.abs(labelCenter - tickCenter)).toBeLessThanOrEqual(1.5);
    }
  });

  test("moves the marker with compositor-friendly transform and disables motion when reduced", async ({ page }) => {
    await openExplore(page);
    const marker = page.locator(".nl-marker");
    const normal = await marker.evaluate((element) => {
      const style = getComputedStyle(element);
      return { property: style.transitionProperty, left: style.left, willChange: style.willChange };
    });
    expect(normal.property).toContain("transform");
    expect(normal.property).not.toContain("left");
    expect(normal.left).toBe("12px");
    expect(normal.willChange).toContain("transform");

    await page.emulateMedia({ reducedMotion: "reduce" });
    const reduced = await marker.evaluate((element) => {
      const style = getComputedStyle(element);
      return { duration: style.transitionDuration, animation: style.animationName };
    });
    expect(reduced.duration).toBe("0s");
    expect(reduced.animation).toBe("none");
  });

  test("keeps pointermove presentation within the typical and throttled budgets", async ({ page, browserName }) => {
    test.skip(browserName !== "chromium", "CDP CPU throttling is Chromium-specific.");

    await openExplore(page);
    await installPerformanceObservers(page);
    await dragSamples(page);

    let state = await readState(page);
    const typical = state.moves.filter((sample) => sample.changed).map((sample) => sample.latencyMs);
    expect(typical.length).toBeGreaterThanOrEqual(150);
    const typicalP95 = p95(typical);
    expect(typicalP95).toBeLessThanOrEqual(16);

    const cdp: CDPSession = await page.context().newCDPSession(page);
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 6 });
    await page.evaluate(() => {
      const state = (window as typeof window & { __nlPerf?: PerfState }).__nlPerf;
      if (state) state.moves = [];
    });
    try {
      await dragSamples(page);
      state = await readState(page);
    } finally {
      await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
    }
    const throttled = state.moves.filter((sample) => sample.changed).map((sample) => sample.latencyMs);
    expect(throttled.length).toBeGreaterThanOrEqual(150);
    const throttledP95 = p95(throttled);
    expect(throttledP95).toBeLessThanOrEqual(50);

    mkdirSync(performanceDirectory, { recursive: true });
    writeFileSync(
      `${performanceDirectory}/input-frame.json`,
      JSON.stringify({
        schemaVersion: 1,
        metric: "pointermove-to-next-frame presentation proxy",
        eventTimingMetric: false,
        sampleCountTypical: typical.length,
        typicalP95Ms: typicalP95,
        sampleCountCpu6x: throttled.length,
        cpu6xP95Ms: throttledP95,
      }, null, 2) + "\n",
    );
  });

  test("records no >50ms long task while dragging and zooming", async ({ page, browserName }) => {
    test.skip(browserName !== "chromium", "Long Task API qualification runs in Chromium.");

    await openExplore(page);
    await installPerformanceObservers(page);
    await dragSamples(page, 200);
    for (let index = 0; index < 8; index += 1) {
      await page.getByRole("button", { name: index % 2 === 0 ? "Zoom in" : "Zoom out" }).click();
    }
    await page.waitForTimeout(100);
    const state = await readState(page);
    const maxLongTask = state.longTasks.length === 0 ? 0 : Math.max(...state.longTasks);
    expect(maxLongTask).toBeLessThanOrEqual(50);

    mkdirSync(performanceDirectory, { recursive: true });
    writeFileSync(
      `${performanceDirectory}/long-tasks.json`,
      JSON.stringify({ schemaVersion: 1, maxLongTaskMs: maxLongTask, observed: state.longTasks }, null, 2) + "\n",
    );
  });

  test("moves from reveal-dwell completion to the next accepting frame within 200ms p95", async ({ page, browserName }) => {
    test.skip(browserName !== "chromium", "Timing evidence is recorded once in Chromium.");

    await page.addInitScript(() => {
      const targetWindow = window as typeof window & { __nlRevealTransitions?: number[] };
      targetWindow.__nlRevealTransitions = [];
      const nativeSetTimeout = window.setTimeout.bind(window);
      const dwellDelays = new Set([900, 1100, 1400, 1700]);

      window.setTimeout = ((handler: TimerHandler, delay?: number, ...args: unknown[]) => {
        if (typeof handler !== "function" || !dwellDelays.has(Number(delay))) {
          return nativeSetTimeout(handler, delay, ...args);
        }
        const wrapped = (...callbackArgs: unknown[]) => {
          const dwellCompletedAt = performance.now();
          (handler as (...handlerArgs: unknown[]) => void)(...callbackArgs);
          let frames = 0;
          const findAcceptingFrame = () => {
            requestAnimationFrame(() => {
              frames += 1;
              const track = document.querySelector(".nl-track:not(.nl-track-locked)");
              const button = document.querySelector<HTMLButtonElement>("button");
              if ((track && document.querySelector('button:not([disabled])')) || frames >= 12) {
                targetWindow.__nlRevealTransitions!.push(performance.now() - dwellCompletedAt);
              } else {
                findAcceptingFrame();
              }
              void button;
            });
          };
          findAcceptingFrame();
        };
        return nativeSetTimeout(wrapped, delay, ...args);
      }) as typeof window.setTimeout;
    });

    await openChallenge(page);
    for (let index = 0; index < 10; index += 1) {
      await expect(page.getByRole("slider")).toBeVisible();
      await page.getByRole("button", { name: "Land here" }).click();
      await expect(page.getByRole("status")).toContainText("Your estimate");
      if (index < 9) await expect(page.getByRole("button", { name: "Land here" })).toBeVisible({ timeout: 3_000 });
    }
    await expect(page.getByRole("heading", { name: /You scored/ })).toBeVisible();

    const transitions = await page.evaluate(() =>
      (window as typeof window & { __nlRevealTransitions?: number[] }).__nlRevealTransitions ?? [],
    );
    expect(transitions.length).toBeGreaterThanOrEqual(9);
    const transitionP95 = p95(transitions);
    expect(transitionP95).toBeLessThanOrEqual(200);

    mkdirSync(performanceDirectory, { recursive: true });
    writeFileSync(
      `${performanceDirectory}/reveal-transition.json`,
      JSON.stringify({
        schemaVersion: 1,
        metric: "scheduled reveal-dwell completion to first next-input frame",
        intentionalDwellExcluded: true,
        samples: transitions,
        p95Ms: transitionP95,
      }, null, 2) + "\n",
    );
  });

  test("completes the core learner and Explore flow in Firefox", async ({ page, browserName }) => {
    test.skip(browserName !== "firefox", "Firefox-specific qualification.");

    await openChallenge(page);
    await page.getByRole("slider").press("ArrowRight");
    await page.getByRole("button", { name: "Land here" }).click();
    await expect(page.getByRole("status")).toContainText("Your estimate");
    await page.getByRole("button", { name: "Exit" }).click();

    await openExplore(page);
    await page.getByRole("button", { name: "Zoom in" }).click();
    await page.getByRole("slider", { name: /Explore number line/ }).press("ArrowRight");
    await expect(page.getByText(/Jumper at/)).toBeVisible();
  });
});
