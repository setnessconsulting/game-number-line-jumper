import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "../browserErrorFixture";
import type { Page } from "@playwright/test";

const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
const baseOrigin = new URL(
  process.env.GAME_NLJ_A11Y_BASE_URL ??
    `http://127.0.0.1:${process.env.GAME_NLJ_A11Y_PORT ?? "4174"}`,
).origin;
const requestFindings = new WeakMap<Page, string[]>();

test.beforeEach(async ({ page }) => {
  const findings: string[] = [];
  requestFindings.set(page, findings);
  page.on("request", (request) => {
    const method = request.method().toUpperCase();
    const url = request.url();

    if (["POST", "PUT", "PATCH", "DELETE"].includes(method)) {
      findings.push(`${method} ${url}`);
    }

    try {
      const parsed = new URL(url);
      if ((parsed.protocol === "http:" || parsed.protocol === "https:") && parsed.origin !== baseOrigin) {
        findings.push(`off-origin ${method} ${url}`);
      }
      if (/sentry|telemetry|observability|analytics|\/ingest\b/i.test(`${parsed.hostname}${parsed.pathname}`)) {
        findings.push(`remote-observability path ${url}`);
      }
    } catch {
      // Browser-local URLs such as data: do not send a network request.
    }
  });
  page.on("websocket", (socket) => {
    if (!socket.url().startsWith(baseOrigin.replace(/^http/, "ws"))) {
      findings.push(`off-origin websocket ${socket.url()}`);
    }
  });
});

test.afterEach(async ({ page }) => {
  expect(requestFindings.get(page) ?? [], "no gameplay writes or remote observability transport").toEqual([]);
});

async function openJumper(page: Page) {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Number Line Jumper", level: 1 })).toBeVisible();
  await expect(page.getByText(/Number Line Jumper · pick your level/)).toBeVisible();
}

async function checkA11y(page: Page, state: string) {
  const axePage = page as unknown as ConstructorParameters<typeof AxeBuilder>[0]["page"];
  const results = await new AxeBuilder({ page: axePage }).withTags(WCAG_TAGS).analyze();
  const blocking = results.violations
    .filter((violation) => violation.impact === "serious" || violation.impact === "critical")
    .map((violation) => ({
      id: violation.id,
      impact: violation.impact,
      help: violation.help,
      nodes: violation.nodes.map((node) => ({ target: node.target, summary: node.failureSummary })),
    }));

  expect(blocking, `${state}: serious/critical axe-core violations`).toEqual([]);
}

async function checkTargetSizes(page: Page, state: string) {
  const undersized = await page
    .locator('button:visible, a[href]:visible, input:visible, select:visible, [role="slider"]:visible')
    .evaluateAll((elements) => {
      const seen = new Set<Element>();
      return elements.flatMap((element) => {
        if (element instanceof HTMLButtonElement && (element.disabled || element.getAttribute("aria-disabled") === "true")) return [];
        if (element instanceof HTMLSelectElement && element.disabled) return [];
        if (element instanceof HTMLInputElement) {
          if (element.disabled || element.type === "hidden") return [];
          if (element.type === "radio" || element.type === "checkbox") {
            const label = element.labels?.[0] ?? element.closest("label");
            if (label) element = label;
          }
        }
        if (element.getAttribute("aria-disabled") === "true" || seen.has(element)) return [];
        seen.add(element);

        const rect = element.getBoundingClientRect();
        const label =
          element.getAttribute("aria-label") ||
          (element instanceof HTMLLabelElement ? element.innerText : "") ||
          (element instanceof HTMLElement ? element.innerText : "") ||
          element.tagName.toLowerCase();
        return rect.width < 48 || rect.height < 48
          ? [{ label: label.trim().replace(/\s+/g, " "), width: rect.width, height: rect.height }]
          : [];
      });
    });

  expect(undersized, `${state}: every interactive target must be at least 48×48 CSS pixels`).toEqual([]);
}

async function checkReflow(page: Page, state: string) {
  const issues = await page.evaluate(() => {
    const viewportWidth = document.documentElement.clientWidth;
    const visible = (element: Element) => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
    };
    const targets = new Set<Element>();

    for (const element of document.querySelectorAll('button, a[href], input, select, [role="slider"]')) {
      if (!visible(element) || element.getAttribute("aria-disabled") === "true") continue;
      if (element instanceof HTMLButtonElement && element.disabled) continue;
      if (element instanceof HTMLSelectElement && element.disabled) continue;
      if (element instanceof HTMLInputElement) {
        if (element.disabled || element.type === "hidden") continue;
        if (element.type === "radio" || element.type === "checkbox") {
          targets.add(element.labels?.[0] ?? element.closest("label") ?? element);
          continue;
        }
      }
      targets.add(element);
    }

    const boxes = [...targets].map((element) => {
      const rect = element.getBoundingClientRect();
      const label = element.getAttribute("aria-label") || (element instanceof HTMLElement ? element.innerText : "") || element.tagName;
      return { label: label.trim().replace(/\s+/g, " "), left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom };
    });
    const outsideViewport = boxes
      .filter((box) => box.left < -1 || box.right > viewportWidth + 1)
      .map(({ label, left, right }) => ({ label, left, right }));
    const overlaps: string[] = [];

    for (let first = 0; first < boxes.length; first += 1) {
      for (let second = first + 1; second < boxes.length; second += 1) {
        const a = boxes[first]!;
        const b = boxes[second]!;
        const overlapX = Math.min(a.right, b.right) - Math.max(a.left, b.left);
        const overlapY = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
        if (overlapX > 2 && overlapY > 2) overlaps.push(`${a.label} overlaps ${b.label}`);
      }
    }

    const clippedContent = [...document.querySelectorAll("h1, h2, h3, p, button, a[href], label, select, .nl-feedback")]
      .filter((element) => visible(element) && !element.closest('[aria-hidden="true"]'))
      .flatMap((element) => {
        const style = getComputedStyle(element);
        const clipsX = ["hidden", "clip"].includes(style.overflowX) && element.scrollWidth > element.clientWidth + 1;
        const clipsY = ["hidden", "clip"].includes(style.overflowY) && element.scrollHeight > element.clientHeight + 1;
        return clipsX || clipsY
          ? [(element instanceof HTMLElement ? element.innerText : element.tagName).trim().replace(/\s+/g, " ")]
          : [];
      });
    const overflowingElements = [...document.querySelectorAll("body *")]
      .filter((element) => visible(element) && element.getBoundingClientRect().right > viewportWidth + 1)
      .map((element) => {
        const rect = element.getBoundingClientRect();
        const text = element instanceof HTMLElement ? element.innerText : "";
        return {
          tag: element.tagName.toLowerCase(),
          className: typeof element.className === "string" ? element.className : "",
          text: text.trim().replace(/\s+/g, " ").slice(0, 80),
          left: rect.left,
          right: rect.right,
        };
      })
      .sort((a, b) => b.right - a.right)
      .slice(0, 12);

    return {
      viewportWidth,
      documentWidth: document.documentElement.scrollWidth,
      outsideViewport,
      overlaps,
      clippedContent,
      overflowingElements,
    };
  });

  expect(issues.documentWidth, `${state}: no horizontal page overflow at 200% zoom; ${JSON.stringify(issues)}`).toBeLessThanOrEqual(issues.viewportWidth);
  expect(issues.outsideViewport, `${state}: controls remain inside the viewport`).toEqual([]);
  expect(issues.overlaps, `${state}: interactive targets do not overlap`).toEqual([]);
  expect(issues.clippedContent, `${state}: required content is not clipped`).toEqual([]);
}

async function finishRoundWithKeyboard(page: Page, firstTrial = 1) {
  for (let trial = firstTrial; trial <= 10; trial += 1) {
    await expect(page.getByText(`Trial ${trial} of 10 · place the jumper, then press Land`)).toBeVisible({ timeout: 10_000 });
    const slider = page.getByRole("slider");
    await slider.focus();
    await page.keyboard.press("Enter");
  }
  await expect(page.getByRole("heading", { name: /You scored \d+ points/ })).toBeVisible({ timeout: 10_000 });
}

async function finishRoundWithPointer(page: Page, firstTrial = 1) {
  for (let trial = firstTrial; trial <= 10; trial += 1) {
    await expect(page.getByText(`Trial ${trial} of 10 · place the jumper, then press Land`)).toBeVisible({ timeout: 10_000 });
    await page.getByRole("button", { name: "Land here" }).click();
  }
  await expect(page.getByRole("heading", { name: /You scored \d+ points/ })).toBeVisible({ timeout: 10_000 });
}

test.describe("Number Line Jumper production accessibility", () => {
  test("passes axe and 48px target checks on setup and Guided warm-up", async ({ page }) => {
    await openJumper(page);
    await checkA11y(page, "setup");
    await checkTargetSizes(page, "setup");

    await page.getByRole("button", { name: /Grades 1/ }).click();
    await expect(page.getByRole("heading", { name: "Build the picture before you jump." })).toBeFocused();
    await checkA11y(page, "Guided warm-up");
    await checkTargetSizes(page, "Guided warm-up");
  });

  test("covers Challenge, reveal, and a full keyboard-only round through summary", async ({ page }) => {
    await openJumper(page);

    // Traverse setup without pointer input: Tab reaches the exit link and the
    // selected radio; arrow keys choose Challenge and Enter starts level one.
    await page.keyboard.press("Tab");
    await expect(page.getByRole("button", { name: "All games" })).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(page.getByRole("radio", { name: /Guided warm-up/ })).toBeFocused();
    await page.keyboard.press("ArrowRight");
    await expect(page.getByRole("radio", { name: "Challenge" })).toBeChecked();
    await page.keyboard.press("Tab");
    const firstBand = page.getByRole("button", { name: /Grades 1/ });
    await expect(firstBand).toBeFocused();
    await page.keyboard.press("Enter");

    await expect(page.getByRole("heading", { name: /Land on / })).toBeFocused();
    await page.keyboard.press("Tab");
    const slider = page.getByRole("slider");
    await expect(slider).toBeFocused();
    await checkA11y(page, "Challenge before reveal");
    await checkTargetSizes(page, "Challenge before reveal");

    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("Enter");
    const feedback = page.getByRole("status");
    await expect(feedback).toBeFocused();
    await expect(feedback).toContainText("Your estimate");
    await expect(feedback).toContainText("Target");
    await expect(feedback).toContainText("Try this next time");
    await expect(page.locator(".nl-marker-label")).toHaveText("Your estimate");
    await expect(page.locator(".nl-truth-flag")).toBeVisible();
    const nonColorMarkers = await page.evaluate(() => ({
      jumperShape: getComputedStyle(document.querySelector(".nl-jumper-token")!).borderRadius,
      truthShape: getComputedStyle(document.querySelector(".nl-truth-flag")!).borderRadius,
      truthLabel: getComputedStyle(document.querySelector(".nl-truth-flag")!, "::before").content,
      truthLine: getComputedStyle(document.querySelector(".nl-truth")!).width,
    }));
    expect(nonColorMarkers.jumperShape).not.toBe(nonColorMarkers.truthShape);
    expect(nonColorMarkers.truthLabel).toContain("Target");
    expect(nonColorMarkers.truthLine).toBe("2px");
    await checkA11y(page, "reveal and feedback");
    await checkTargetSizes(page, "reveal and feedback");

    await finishRoundWithKeyboard(page, 2);
    await checkA11y(page, "summary");
    await checkTargetSizes(page, "summary");
  });

  test("passes axe and target-size checks in Explore with keyboard zoom", async ({ page }) => {
    await openJumper(page);
    await page.getByRole("button", { name: "Explore an untimed line" }).click();
    await checkA11y(page, "Explore");
    await checkTargetSizes(page, "Explore");

    const slider = page.getByRole("slider", { name: /Explore number line/ });
    await slider.focus();
    await page.keyboard.press("ArrowUp");
    await expect(page.locator(".nl-zoom-controls .microcopy")).toContainText("Zoom level 2 of 8");
    await checkA11y(page, "Explore with zoom engaged");
    await checkTargetSizes(page, "Explore with zoom engaged");
  });

  test("reflows without overflow, clipping, or control collisions at 200% zoom", async ({ page }) => {
    await openJumper(page);
    const viewport = page.viewportSize();
    if (!viewport) throw new Error("The accessibility project must define a viewport.");
    await page.setViewportSize({ width: Math.floor(viewport.width / 2), height: viewport.height });

    await checkReflow(page, "setup");
    await page.getByRole("button", { name: /Grades 1/ }).click();
    await checkReflow(page, "Guided warm-up");
    await page.getByRole("button", { name: "Start guided round" }).click();
    await checkReflow(page, "playing");
    await page.getByRole("slider").focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("status")).toContainText("Your estimate");
    await checkReflow(page, "reveal and feedback");
    await finishRoundWithKeyboard(page, 2);
    await checkReflow(page, "summary");

    await page.getByRole("button", { name: "Change level" }).click();
    await page.getByRole("button", { name: "Explore an untimed line" }).click();
    const exploreSlider = page.getByRole("slider", { name: /Explore number line/ });
    await exploreSlider.focus();
    await page.keyboard.press("ArrowUp");
    await checkReflow(page, "Explore with zoom engaged");
  });

  test("reduced motion removes reveal and zoom motion while a complete round remains playable", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await openJumper(page);
    await page.getByRole("button", { name: /Grades 1/ }).click();
    await page.getByRole("button", { name: "Start guided round" }).click();
    await page.getByRole("slider").focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("status")).toContainText("Your estimate");

    const revealMotion = await page.evaluate(() => ({
      reduced: matchMedia("(prefers-reduced-motion: reduce)").matches,
      markerAnimation: getComputedStyle(document.querySelector(".nl-marker-reveal .nl-jumper-token")!).animationName,
      targetAnimation: getComputedStyle(document.querySelector(".nl-truth-reveal")!).animationName,
      trackTransition: getComputedStyle(document.querySelector(".nl-track")!).transitionDuration,
    }));
    expect(revealMotion).toMatchObject({
      reduced: true,
      markerAnimation: "none",
      targetAnimation: "none",
      trackTransition: "0s",
    });

    await finishRoundWithPointer(page, 2);
    await page.getByRole("button", { name: "Change level" }).click();
    await page.getByRole("button", { name: "Explore an untimed line" }).click();
    const exploreSlider = page.getByRole("slider", { name: /Explore number line/ });
    await exploreSlider.focus();
    await page.keyboard.press("ArrowUp");

    const zoomTransition = await page.locator(".nl-zoom-tick").first().evaluate((element) => getComputedStyle(element).transitionDuration);
    expect(zoomTransition).toBe("0s");
    await expect(page.locator(".nl-zoom-controls .microcopy")).toContainText("Zoom level 2 of 8");
  });
});
