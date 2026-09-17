import { expect, test, type Page } from "@playwright/test";

async function openJumper(page: Page) {
  await page.goto("/");
  await expect(page.getByText(/Number Line Jumper · pick your level/)).toBeVisible();
}

test.describe("Number Line Jumper browser flow", () => {
  test("starts every placement band and keeps the round playable", async ({ page }) => {
    for (const label of [/Grades 1/, /Grades 3/, /Grades 5/, /Grades 7/]) {
      await openJumper(page);
      await page.getByRole("button", { name: label }).click();
      await expect(page.getByText(/Quick warm-up/)).toBeVisible();
      await page.getByRole("button", { name: "Start guided round" }).click();
      await expect(page.getByRole("slider")).toBeVisible();
      await expect(page.getByText(/Session-only play/)).toBeVisible();
      await page.getByRole("button", { name: "Exit" }).click();
      await expect(page.getByText(/Number Line Jumper · pick your level/)).toBeVisible();
    }
  });

  test("supports keyboard placement, midpoint scaffolding, feedback, and clean exit", async ({ page }) => {
    await openJumper(page);
    await page.getByRole("button", { name: /Grades 3/ }).click();
    await page.getByRole("button", { name: "Start guided round" }).click();

    const slider = page.getByRole("slider");
    await expect(slider).toHaveAttribute("aria-orientation", "horizontal");
    await expect(slider).toHaveAttribute("aria-describedby", /.+/);
    await expect(slider).toHaveAttribute("aria-valuetext", /on a line from/);
    await slider.focus();
    const before = Number(await slider.getAttribute("aria-valuenow"));
    await page.keyboard.press("ArrowRight");
    await expect(slider).toHaveAttribute("aria-valuenow", String(Math.min(100, before + 2)));

    await page.getByRole("button", { name: "Show midpoint hint" }).click();
    await expect(page.getByText(/Start with the midpoint/)).toBeVisible();
    await page.getByRole("button", { name: "Land here" }).click();

    const feedback = page.getByRole("status");
    await expect(feedback).toContainText("Your estimate");
    await expect(feedback).toContainText("Target");
    await expect(feedback).toBeFocused();

    await page.getByRole("button", { name: "Exit" }).click();
    await expect(page.getByText(/Number Line Jumper · pick your level/)).toBeVisible();
    expect(await page.evaluate(() => localStorage.length)).toBe(0);
  });

  test("keeps the number line inside a mobile viewport", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile", "The touch-target assertion belongs to the mobile project.");
    await openJumper(page);
    await page.getByRole("button", { name: /Grades 1/ }).click();
    await page.getByRole("button", { name: "Start guided round" }).click();
    const dimensions = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      viewportWidth: window.innerWidth,
    }));
    expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.viewportWidth);
    const box = await page.getByRole("slider").boundingBox();
    expect(box?.height).toBeGreaterThanOrEqual(72);
  });

  test("offers a direct challenge and an untimed exploration path", async ({ page }) => {
    await openJumper(page);
    await page.locator('input[name="number-line-mode"][value="challenge"]').check();
    await page.getByRole("button", { name: /Grades 7/ }).click();
    await expect(page.getByRole("heading", { name: /Land on / })).toBeVisible();
    const challengeSlider = page.getByRole("slider");
    await expect(challengeSlider).toBeVisible();
    await expect(challengeSlider).toHaveAttribute("aria-valuetext", /on a line from/);
    await expect(page.getByText(/s left/)).toBeVisible();
    await expect(page.locator(".nl-zoom-controls")).toHaveCount(0);
    await page.getByRole("button", { name: "Exit" }).click();

    await openJumper(page);
    await page.getByRole("button", { name: "Explore an untimed line" }).click();
    const exploreSlider = page.getByRole("slider", { name: /Explore number line/ });
    await expect(exploreSlider).toBeVisible();
    await expect(exploreSlider).toHaveAttribute("aria-valuetext", /on a line from/);
    await expect(page.getByText(/Untimed number sense lab/)).toBeVisible();
    await expect(page.getByText(/Exploration is untimed/)).toBeVisible();
    await exploreSlider.press("ArrowRight");
    await expect(page.getByText(/Jumper at/)).toBeVisible();
  });

  test("zooms the explore line from -10 to 1000 with keyboard, buttons, and prompts", async ({ page }) => {
    await openJumper(page);
    await page.getByRole("button", { name: "Explore an untimed line" }).click();
    const slider = page.getByRole("slider", { name: /Explore number line/ });
    await expect(slider).toBeVisible();
    await expect(slider).toHaveAttribute("aria-valuetext", /to 1000/);
    const zoomStatus = page.locator(".nl-zoom-controls .microcopy");
    await expect(zoomStatus).toContainText("Zoom level 1 of 8");

    // Keyboard zoom narrows the window and updates the readout.
    await slider.press("ArrowUp");
    await expect(zoomStatus).toContainText("Zoom level 2 of 8");
    await expect(slider).toHaveAttribute("aria-valuetext", /Zoom level 2 of 8/);
    await slider.press("ArrowDown");
    await expect(zoomStatus).toContainText("Zoom level 1 of 8");

    // Discrete buttons + slider zoom deeper with decimal subdivision.
    await page.getByRole("button", { name: "Zoom in" }).click();
    await page.getByRole("button", { name: "Zoom in" }).click();
    await expect(zoomStatus).toContainText("Zoom level 3 of 8");
    await expect(zoomStatus).toContainText("major ticks every");
    await page.getByRole("button", { name: "Zoom out" }).click();
    await expect(zoomStatus).toContainText("Zoom level 2 of 8");

    // Pan buttons keep the line inside the anchor.
    await page.getByRole("button", { name: "Pan line left" }).click();
    await expect(slider).toHaveAttribute("aria-valuetext", /on a line from/);
    await page.getByRole("button", { name: "Pan line right" }).click();

    // Unscored mini-prompt appears on demand and stays unscored.
    await page.getByRole("button", { name: "Find this number" }).click();
    await expect(page.locator(".nl-explore-prompt")).toContainText("Unscored practice");
    await expect(page.locator(".nl-explore-prompt")).not.toContainText("point");

    // Nothing about exploration is persisted.
    expect(await page.evaluate(() => localStorage.length)).toBe(0);
    expect(await page.evaluate(() => sessionStorage.length)).toBe(0);
  });

  test("surfaces session-only visit bests with record callouts and reload reset", async ({ page }) => {
    // Round 1 parks every estimate at the far-left endpoint; round 2 lands
    // every estimate on the midpoint (the slider's resting position), which
    // is systematically closer for this band's target distribution and so
    // sets a new visit-best average error.
    const landTenTrials = async (markerKey: "Home" | null) => {
      const slider = page.getByRole("slider");
      for (let i = 0; i < 10; i += 1) {
        await expect(slider).toBeVisible();
        if (markerKey) await slider.press(markerKey);
        await page.getByRole("button", { name: "Land here" }).click();
        await expect(page.getByRole("status")).toContainText("Your estimate");
        if (i < 9) await expect(page.getByRole("button", { name: "Land here" })).toBeVisible();
      }
      await expect(page.getByRole("heading", { name: /You scored/ })).toBeVisible();
    };

    // First completed run establishes the visit baselines (LEVELBEST-57 AC1).
    await openJumper(page);
    await page.getByRole("button", { name: /Grades 1/ }).click();
    await page.getByRole("button", { name: "Start guided round" }).click();
    await landTenTrials("Home");
    await expect(page.getByText("Best avg error this visit")).toBeVisible();
    await expect(page.getByText("Best close streak this visit")).toBeVisible();
    await expect(page.getByText(/Best this visit —/)).toBeVisible();
    // First run sets baselines silently — nothing was beaten yet.
    await expect(page.getByText(/New best/)).toHaveCount(0);

    // A second, sharper run (midpoint placements — the slider's resting spot)
    // improves the records and calls out the improvement in coaching tone.
    await page.getByRole("button", { name: "Play again" }).click();
    await landTenTrials(null);
    await expect(page.getByText(/New best (average error|close streak) this visit/).first()).toBeVisible();

    // Visit bests are page-session memory only: nothing is written to storage.
    const storage = await page.evaluate(() => ({
      local: localStorage.length,
      session: sessionStorage.length,
      cookies: document.cookie.length,
    }));
    expect(storage.local).toBe(0);
    expect(storage.session).toBe(0);
    expect(storage.cookies).toBe(0);

    // Reloading the page starts a fresh visit with no previous records.
    await page.reload();
    await expect(page.getByText(/Number Line Jumper · pick your level/)).toBeVisible();
    await page.getByRole("button", { name: /Grades 1/ }).click();
    await page.getByRole("button", { name: "Start guided round" }).click();
    await expect(page.getByRole("slider")).toBeVisible();
    await page.getByRole("slider").press("Home");
    await page.getByRole("button", { name: "Land here" }).click();
    await expect(page.getByRole("status")).toContainText("Your estimate");
    await expect(page.getByRole("button", { name: "Land here" })).toBeVisible();
    // Fresh visit: no "Best this visit —" line exists yet in this session.
    await expect(page.getByText(/Best this visit —/)).toHaveCount(0);
  });
});

type AudioTrace = { contexts: number; notes: number[] };

async function readAudioTrace(page: Page): Promise<AudioTrace> {
  return page.evaluate(() => (window as unknown as { __nlAudio: AudioTrace }).__nlAudio);
}

test.describe("Number Line Jumper opt-in sound cues", () => {
  test("creates no audio before sound is enabled, then cues after opt-in", async ({ page }) => {
    await page.addInitScript(() => {
      const trace = { contexts: 0, notes: [] as number[] };
      class RecordingAudioContext {
        currentTime = 0;
        destination = {};
        constructor() {
          trace.contexts += 1;
        }
        createOscillator() {
          return {
            type: "",
            frequency: { setValueAtTime: (value: number) => trace.notes.push(value) },
            connect: () => undefined,
            start: () => undefined,
            stop: () => undefined,
          };
        }
        createGain() {
          return {
            gain: {
              setValueAtTime: () => undefined,
              exponentialRampToValueAtTime: () => undefined,
            },
            connect: () => undefined,
          };
        }
        resume() {
          return Promise.resolve();
        }
        close() {
          return Promise.resolve();
        }
      }
      Object.defineProperty(window, "AudioContext", { configurable: true, value: RecordingAudioContext });
      (window as unknown as { __nlAudio: AudioTrace }).__nlAudio = trace;
    });

    const reopen = async () => {
      await expect(page.getByText(/Number Line Jumper · pick your level/)).toBeVisible();
    };

    // Opt-in contract: with sound off (default), starting a round and scoring a
    // placement must not create any AudioContext or oscillator.
    await openJumper(page);
    await page.getByRole("button", { name: /Grades 3/ }).click();
    await page.getByRole("button", { name: "Start guided round" }).click();
    await expect(page.getByRole("slider")).toBeVisible();
    let trace = await readAudioTrace(page);
    expect(trace.contexts).toBe(0);
    expect(trace.notes).toEqual([]);

    await page.getByRole("slider").press("ArrowRight");
    await page.getByRole("button", { name: "Land here" }).click();
    await expect(page.getByRole("status")).toContainText("Your estimate");
    trace = await readAudioTrace(page);
    expect(trace.contexts).toBe(0);
    expect(trace.notes).toEqual([]);

    // Opt in from setup, then restart: the round-start cue plays on one context.
    await page.getByRole("button", { name: "Exit" }).click();
    await expect(page.getByText(/Number Line Jumper · pick your level/)).toBeVisible();
    await reopen();
    await page.getByRole("checkbox", { name: "Quiet sound cues (optional)" }).check();
    await page.getByRole("button", { name: /Grades 3/ }).click();
    await page.getByRole("button", { name: "Start guided round" }).click();
    await expect(page.getByRole("slider")).toBeVisible();
    trace = await readAudioTrace(page);
    expect(trace.contexts).toBe(1);
    expect(trace.notes).toHaveLength(2);

    // A scored placement adds a closeness cue on the same reused context.
    await page.getByRole("slider").press("ArrowRight");
    await page.getByRole("button", { name: "Land here" }).click();
    await expect(page.getByRole("status")).toContainText("Your estimate");
    trace = await readAudioTrace(page);
    expect(trace.contexts).toBe(1);
    const notesAfterOptInCues = trace.notes.length;
    expect(notesAfterOptInCues).toBeGreaterThan(2);

    // Toggling sound off suppresses further cues through a full reveal cycle.
    await page.getByRole("checkbox", { name: "Sound", exact: true }).uncheck();
    await expect(page.getByRole("slider")).toHaveAttribute("aria-valuenow", "50");
    await page.getByRole("slider").press("ArrowRight");
    await page.getByRole("button", { name: "Land here" }).click();
    await expect(page.getByRole("status")).toContainText("Your estimate");
    await expect(page.getByRole("slider")).toHaveAttribute("aria-valuenow", "50");
    trace = await readAudioTrace(page);
    expect(trace.contexts).toBe(1);
    expect(trace.notes).toHaveLength(notesAfterOptInCues);
  });
});
