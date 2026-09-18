import { mkdirSync, writeFileSync } from "node:fs";
import { expect, test } from "../browserErrorFixture";
import type { CDPSession, Page } from "@playwright/test";

type MoveMetric = { latencyMs: number; changed: boolean };
type PerfWindow = typeof window & {
  __nlLongTasks?: number[];
  __nlRevealTransitions?: number[];
  __nlMoveSamples?: MoveMetric[];
  __nlMoveObserverInstalled?: boolean;
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

async function installLongTaskObserver(page: Page) {
  await page.evaluate(() => {
    const targetWindow = window as PerfWindow;
    targetWindow.__nlLongTasks = [];
    try {
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) targetWindow.__nlLongTasks!.push(entry.duration);
      });
      observer.observe({ type: "longtask", buffered: false });
    } catch {
      // Long Task API is Chromium-only in this qualification lane.
    }
  });
}

async function measurePointerMoves(page: Page, count = 220): Promise<MoveMetric[]> {
  const track = page.locator(".nl-track-explore");
  const box = await track.boundingBox();
  if (!box) throw new Error("Explore track has no bounding box.");

  await page.evaluate(() => {
    const targetWindow = window as PerfWindow;
    targetWindow.__nlMoveSamples = [];
    if (targetWindow.__nlMoveObserverInstalled) return;

    const trackElement = document.querySelector<HTMLElement>(".nl-track-explore");
    const marker = trackElement?.querySelector<HTMLElement>(".nl-marker");
    if (!trackElement || !marker) throw new Error("Explore performance targets are missing.");

    trackElement.addEventListener("pointermove", (event) => {
      const before = marker.style.getPropertyValue("--nl-pos");
      const eventTimestamp = event.timeStamp;
      requestAnimationFrame(() => {
        const after = marker.style.getPropertyValue("--nl-pos");
        targetWindow.__nlMoveSamples!.push({
          latencyMs: Math.max(0, performance.now() - eventTimestamp),
          changed: after !== before,
        });
      });
    });
    targetWindow.__nlMoveObserverInstalled = true;
  });

  const inset = 18;
  const y = box.height / 2;
  await track.hover({ position: { x: inset, y } });
  await page.mouse.down();
  try {
    for (let index = 0; index < count; index += 1) {
      const half = Math.max(1, Math.floor(count / 2));
      const fraction = index < half
        ? index / Math.max(1, half - 1)
        : 1 - (index - half) / Math.max(1, count - half - 1);
      const x = box.x + inset + fraction * (box.width - inset * 2);
      await page.mouse.move(x, box.y + y);
      if (index % 4 === 0) await page.waitForTimeout(1);
    }
  } finally {
    await page.mouse.up();
  }
  await page.waitForTimeout(100);
  return page.evaluate(() => (window as PerfWindow).__nlMoveSamples ?? []);
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
    const typicalSamples = await measurePointerMoves(page);
    const typical = typicalSamples.map((sample) => sample.latencyMs);
    expect(typical.length).toBeGreaterThanOrEqual(180);
    const typicalP95 = p95(typical);
    expect(typicalP95).toBeLessThanOrEqual(16);

    const cdp: CDPSession = await page.context().newCDPSession(page);
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 6 });
    let throttledSamples: MoveMetric[];
    try {
      throttledSamples = await measurePointerMoves(page);
    } finally {
      await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
    }
    const throttled = throttledSamples.map((sample) => sample.latencyMs);
    expect(throttled.length).toBeGreaterThanOrEqual(180);
    const throttledP95 = p95(throttled);
    expect(throttledP95).toBeLessThanOrEqual(50);

    mkdirSync(performanceDirectory, { recursive: true });
    writeFileSync(
      `${performanceDirectory}/input-frame.json`,
      JSON.stringify({
        schemaVersion: 1,
        metric: "pointermove-to-next-frame presentation proxy",
        eventTimingMetric: false,
        dispatchedMoves: 220,
        sampleCountTypical: typical.length,
        changedSamplesTypical: typicalSamples.filter((sample) => sample.changed).length,
        typicalP95Ms: typicalP95,
        sampleCountCpu6x: throttled.length,
        changedSamplesCpu6x: throttledSamples.filter((sample) => sample.changed).length,
        cpu6xP95Ms: throttledP95,
      }, null, 2) + "\n",
    );
  });

  test("records no >50ms long task while dragging and zooming", async ({ page, browserName }) => {
    test.skip(browserName !== "chromium", "Long Task API qualification runs in Chromium.");

    await openExplore(page);
    await installLongTaskObserver(page);
    await measurePointerMoves(page, 200);
    for (let index = 0; index < 8; index += 1) {
      await page.getByRole("button", { name: index % 2 === 0 ? "Zoom in" : "Zoom out" }).click();
    }
    await page.waitForTimeout(100);
    const observed = await page.evaluate(() => (window as PerfWindow).__nlLongTasks ?? []);
    const maxLongTask = observed.length === 0 ? 0 : Math.max(...observed);
    expect(maxLongTask).toBeLessThanOrEqual(50);

    mkdirSync(performanceDirectory, { recursive: true });
    writeFileSync(
      `${performanceDirectory}/long-tasks.json`,
      JSON.stringify({ schemaVersion: 1, maxLongTaskMs: maxLongTask, observed }, null, 2) + "\n",
    );
  });

  test("moves from reveal-dwell completion to the next accepting frame within 200ms p95", async ({ page, browserName }) => {
    test.skip(browserName !== "chromium", "Timing evidence is recorded once in Chromium.");

    await page.addInitScript(() => {
      const targetWindow = window as PerfWindow;
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
              if ((track && document.querySelector('button:not([disabled])')) || frames >= 12) {
                targetWindow.__nlRevealTransitions!.push(performance.now() - dwellCompletedAt);
              } else {
                findAcceptingFrame();
              }
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

    const transitions = await page.evaluate(() => (window as PerfWindow).__nlRevealTransitions ?? []);
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
