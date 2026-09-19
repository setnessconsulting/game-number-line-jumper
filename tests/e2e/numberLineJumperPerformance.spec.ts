import { expect, test } from "../browserErrorFixture";
import type { Page } from "@playwright/test";

type PerformanceHarness = {
  armReveal: boolean;
  awaitingRevealFrame: boolean;
  callbackStartedAt: number | null;
  longTaskSupported: boolean;
  longTasks: Array<{ startTime: number; duration: number }>;
  lastPointerTransform: string | null;
  measurePointerMoves: boolean;
  pointerEvents: number;
  pointerSamples: Array<{ inputToStyleMs: number; inputToFrameMs: number }>;
  revealDelays: number[];
  revealFrames: number[];
};

type WindowWithPerformanceHarness = Window & { __nljPerf: PerformanceHarness };

async function installPerformanceHarness(page: Page) {
  await page.addInitScript(() => {
    const state: PerformanceHarness = {
      armReveal: false,
      awaitingRevealFrame: false,
      callbackStartedAt: null,
      longTaskSupported: false,
      longTasks: [],
      lastPointerTransform: null,
      measurePointerMoves: false,
      pointerEvents: 0,
      pointerSamples: [],
      revealDelays: [],
      revealFrames: [],
    };
    Object.defineProperty(window, "__nljPerf", { value: state });

    const originalSetTimeout = window.setTimeout.bind(window);
    const revealDelays = new Set([900, 1100, 1400, 1700]);
    window.setTimeout = ((handler: TimerHandler, timeout?: number, ...args: unknown[]) => {
      const delay = Number(timeout ?? 0);
      if (state.armReveal && typeof handler === "function" && revealDelays.has(delay)) {
        state.armReveal = false;
        state.revealDelays.push(delay);
        return originalSetTimeout(() => {
          state.callbackStartedAt = performance.now();
          state.awaitingRevealFrame = true;
          handler(...args);
        }, delay);
      }
      return originalSetTimeout(handler, timeout, ...args);
    }) as typeof window.setTimeout;

    document.addEventListener("pointermove", (event) => {
      if (!state.measurePointerMoves || !(event.target instanceof Element) || !event.target.closest(".nl-track")) return;
      const inputAt = event.timeStamp;
      state.pointerEvents += 1;
      queueMicrotask(() => {
        if (!state.measurePointerMoves) return;
        const transformAfter = document.querySelector<HTMLElement>(".nl-marker")?.style.transform ?? "";
        const transformBefore = state.lastPointerTransform;
        state.lastPointerTransform = transformAfter;
        if (transformBefore === transformAfter) return;
        const styleAt = performance.now();
        requestAnimationFrame(() => {
          state.pointerSamples.push({
            inputToStyleMs: styleAt - inputAt,
            inputToFrameMs: performance.now() - inputAt,
          });
        });
      });
    }, { passive: true });

    const mutations = new MutationObserver(() => {
      if (!state.awaitingRevealFrame) return;
      const slider = document.querySelector(".nl-track");
      if (slider?.getAttribute("aria-disabled") === "false" && state.callbackStartedAt !== null) {
        state.awaitingRevealFrame = false;
        const callbackStart = state.callbackStartedAt;
        requestAnimationFrame(() => state.revealFrames.push(performance.now() - callbackStart));
      }
    });
    mutations.observe(document, {
      subtree: true,
      attributes: true,
      attributeFilter: ["aria-disabled"],
    });

    if (PerformanceObserver.supportedEntryTypes.includes("longtask")) {
      const longTasks = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          state.longTasks.push({ startTime: entry.startTime, duration: entry.duration });
        }
      });
      longTasks.observe({ type: "longtask", buffered: true });
      state.longTaskSupported = true;
    }
  });
}

async function getHarness(page: Page) {
  return page.evaluate(() => (window as unknown as WindowWithPerformanceHarness).__nljPerf);
}

function percentile95(values: number[]) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.max(0, Math.ceil(sorted.length * 0.95) - 1)] ?? Number.POSITIVE_INFINITY;
}

test.describe("Number Line Jumper performance qualification", () => {
  test("measures 200 drag updates at normal and 6x CPU throttle", async ({ page, browserName }, testInfo) => {
    test.skip(browserName !== "chromium", "CDP CPU throttling qualification runs in Chromium");
    test.setTimeout(120_000);
    await installPerformanceHarness(page);
    await page.goto("/");
    await page.getByRole("button", { name: /Grades 3/ }).click();
    await page.getByRole("button", { name: "Start guided round" }).click();

    const slider = page.getByRole("slider");
    const box = await slider.boundingBox();
    expect(box).not.toBeNull();
    const startX = box!.x + 14;
    const endX = box!.x + box!.width - 14;
    const y = box!.y + box!.height / 2;
    const session = await page.context().newCDPSession(page);

    const measureDrag = async (fromX: number, toX: number, cpuRate: number) => {
      await session.send("Emulation.setCPUThrottlingRate", { rate: cpuRate });
      await page.mouse.move(fromX, y);
      await page.mouse.down();
      const startedAt = await page.evaluate(() => {
        const state = (window as unknown as WindowWithPerformanceHarness).__nljPerf;
        state.pointerEvents = 0;
        state.pointerSamples = [];
        state.lastPointerTransform = document.querySelector<HTMLElement>(".nl-marker")?.style.transform ?? null;
        state.measurePointerMoves = true;
        return performance.now();
      });

      await page.mouse.move(toX, y, { steps: 200 });

      await page.mouse.up();
      const result = await page.evaluate(() => new Promise<{
        endedAt: number;
        pointerEvents: number;
        pointerSamples: Array<{ inputToStyleMs: number; inputToFrameMs: number }>;
        longTasks: Array<{ startTime: number; duration: number }>;
        longTaskSupported: boolean;
      }>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => {
        const state = (window as unknown as WindowWithPerformanceHarness).__nljPerf;
        state.measurePointerMoves = false;
        resolve({
          endedAt: performance.now(),
          pointerEvents: state.pointerEvents,
          pointerSamples: state.pointerSamples,
          longTasks: state.longTasks,
          longTaskSupported: state.longTaskSupported,
        });
      }))));
      const dragLongTasks = result.longTasks
        .filter((entry) => entry.startTime >= startedAt && entry.startTime < result.endedAt)
        .map((entry) => entry.duration);
      return {
        cpuRate,
        pointerEvents: result.pointerEvents,
        pointerSamples: result.pointerSamples,
        longTasks: dragLongTasks,
        longTaskSupported: result.longTaskSupported,
        p95ToStyleMs: percentile95(result.pointerSamples.map((sample) => sample.inputToStyleMs)),
        p95Ms: percentile95(result.pointerSamples.map((sample) => sample.inputToFrameMs)),
      };
    };

    const typical = await measureDrag(startX, endX, 1);
    const throttled = await measureDrag(endX, startX, 6);
    await session.detach();

    const report = { browser: browserName, typical, throttled };
    const compact = (result: typeof typical) => ({
      cpuRate: result.cpuRate,
      pointerEvents: result.pointerEvents,
      pointerSamples: result.pointerSamples.length,
      p95ToStyleMs: result.p95ToStyleMs,
      p95ToFrameMs: result.p95Ms,
      longTasks: result.longTasks,
    });
    console.info(`GAME-219 pointer-frame-latency ${JSON.stringify({ browser: browserName, typical: compact(typical), throttled: compact(throttled) })}`);
    await testInfo.attach("pointer-frame-latency.json", {
      body: JSON.stringify(report, null, 2),
      contentType: "application/json",
    });

    for (const result of [typical, throttled]) {
      const summary = {
        cpuRate: result.cpuRate,
        pointerEvents: result.pointerEvents,
        pointerSamples: result.pointerSamples.length,
        p95ToStyleMs: result.p95ToStyleMs,
        p95Ms: result.p95Ms,
        longTasks: result.longTasks,
      };
      expect(result.pointerEvents).toBeGreaterThanOrEqual(180);
      expect(result.pointerSamples.length).toBeGreaterThanOrEqual(180);
      expect(result.longTaskSupported).toBe(true);
      expect(
        result.longTasks.filter((duration) => duration > 50),
        JSON.stringify(summary, null, 2),
      ).toEqual([]);
    }
    const measurements = JSON.stringify({
      typical: { ...typical, pointerSamples: typical.pointerSamples.slice(0, 3) },
      throttled: { ...throttled, pointerSamples: throttled.pointerSamples.slice(0, 3) },
    }, null, 2);
    expect(typical.p95Ms, measurements).toBeLessThanOrEqual(16);
    expect(throttled.p95Ms, measurements).toBeLessThanOrEqual(50);
  });

  test("keeps zoom interactions below the long-task budget", async ({ page, browserName }, testInfo) => {
    test.skip(browserName !== "chromium", "CDP CPU throttling qualification runs in Chromium");
    test.setTimeout(90_000);
    await installPerformanceHarness(page);
    await page.goto("/");
    await page.getByRole("button", { name: "Explore an untimed line" }).click();

    const slider = page.getByRole("slider", { name: /Explore number line/ });
    const box = await slider.boundingBox();
    expect(box).not.toBeNull();
    await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);

    const session = await page.context().newCDPSession(page);
    await session.send("Emulation.setCPUThrottlingRate", { rate: 6 });
    const startedAt = await page.evaluate(() => {
      (window as unknown as WindowWithPerformanceHarness).__nljPerf.longTasks = [];
      return performance.now();
    });

    for (let step = 0; step < 24; step += 1) {
      await page.mouse.wheel(0, step % 2 === 0 ? -120 : 120);
    }
    await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    const endedAt = await page.evaluate(() => performance.now());
    const state = await getHarness(page);
    const longTasks = state.longTasks
      .filter((entry) => entry.startTime >= startedAt && entry.startTime < endedAt)
      .map((entry) => entry.duration);
    await session.detach();

    const report = { browser: browserName, cpuRate: 6, zoomEvents: 24, longTasks };
    console.info(`GAME-219 zoom-long-tasks ${JSON.stringify(report)}`);
    await testInfo.attach("zoom-long-tasks.json", {
      body: JSON.stringify(report, null, 2),
      contentType: "application/json",
    });

    expect(state.longTaskSupported).toBe(true);
    expect(longTasks.filter((duration) => duration > 50), JSON.stringify(report, null, 2)).toEqual([]);
  });

  test("keeps reveal transitions within budget after the intentional dwell", async ({ page, browserName }, testInfo) => {
    test.skip(browserName !== "chromium", "Reveal timing qualification runs in Chromium");
    test.setTimeout(90_000);
    await installPerformanceHarness(page);
    await page.goto("/");
    await page.getByRole("button", { name: /Grades 3/ }).click();
    await page.getByRole("button", { name: "Start guided round" }).click();

    const slider = page.getByRole("slider");
    const latencies: number[] = [];
    for (let trial = 0; trial < 10; trial += 1) {
      await page.evaluate(() => {
        (window as unknown as WindowWithPerformanceHarness).__nljPerf.armReveal = true;
      });
      await page.getByRole("button", { name: "Land here" }).click();
      await expect(page.getByRole("status")).toBeVisible();

      if (trial < 9) {
        await expect(slider).toHaveAttribute("aria-disabled", "false");
        await page.waitForFunction(
          (count) => (window as unknown as WindowWithPerformanceHarness).__nljPerf.revealFrames.length >= count,
          latencies.length + 1,
        );
        const state = await getHarness(page);
        latencies.push(state.revealFrames.at(-1) ?? Number.POSITIVE_INFINITY);
      }
    }

    const state = await getHarness(page);
    const report = {
      browser: browserName,
      sampleCount: latencies.length,
      p95Ms: percentile95(latencies),
      transitionFramesMs: latencies,
      intentionalDwellMs: state.revealDelays.slice(0, latencies.length),
    };
    await testInfo.attach("reveal-transition-latency.json", {
      body: JSON.stringify(report, null, 2),
      contentType: "application/json",
    });

    expect(report.sampleCount).toBe(9);
    expect(report.p95Ms).toBeLessThanOrEqual(200);
    await expect(page.getByRole("heading", { name: /You scored/ })).toBeVisible();
  });
});
