import { expect, test } from "../browserErrorFixture";
import type { Page } from "@playwright/test";

async function setVisibility(page: Page, state: "visible" | "hidden") {
  await page.evaluate((nextState) => {
    Object.defineProperty(document, "visibilityState", { configurable: true, value: nextState });
    document.dispatchEvent(new Event("visibilitychange"));
  }, state);
}

const FIXED_TIME = new Date("2026-01-01T00:00:00.000Z");

test.describe("GAME-292 local host contract harness", () => {
  test("auto-starts a bounded break and returns control to the host on expiry", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "chromium", "The local host lifecycle journey runs once in desktop Chromium.");
    await page.clock.install({ time: FIXED_TIME });
    await page.goto("/examples/host-harness.html?remainingMs=1500");

    await expect(page.getByRole("slider")).toBeVisible();
    await expect(page.getByTestId("host-status")).toHaveText("Host session active");
    await expect(page.getByText(/Break · 2s left/)).toBeVisible();

    await page.clock.fastForward(1_500);
    await expect(page.getByTestId("host-status")).toHaveText("Host returned to practice");
    await expect(page.getByTestId("host-events").locator("li")).toHaveText([
      "aggregate:break-complete:0",
      "return:deadline",
    ]);
    expect(await page.evaluate(() => ({ local: localStorage.length, session: sessionStorage.length }))).toEqual({ local: 0, session: 0 });
  });

  test("uses the manual level picker when placement input is invalid", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "chromium", "The local host lifecycle journey runs once in desktop Chromium.");
    await page.clock.install({ time: FIXED_TIME });
    await page.goto("/examples/host-harness.html?placement=invalid&remainingMs=30000");

    await expect(page.getByText(/Number Line Jumper · pick your level/)).toBeVisible();
    await expect(page.getByTestId("host-events")).toContainText("error:recoverable:INVALID_PLACEMENT_RESULT");
    await expect(page.getByTestId("host-events")).toContainText("error:recoverable:AUTO_START_REQUIRES_BAND");
    await page.getByRole("button", { name: /Grades 1/ }).click();
    await expect(page.getByText(/Quick warm-up/)).toBeVisible();
  });

  test("emits one round-completion fact and a session aggregate to the host", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "chromium", "The local host lifecycle journey runs once in desktop Chromium.");
    await page.clock.install({ time: FIXED_TIME });
    await page.goto("/examples/host-harness.html?remainingMs=120000");
    const slider = page.getByRole("slider");
    await expect(slider).toBeVisible();

    await slider.press("Home");
    await page.getByRole("button", { name: "Land here" }).click();
    await expect(page.locator(".nl-feedback")).toContainText("Your estimate");
    await page.clock.fastForward(2_500);
    await expect(slider).toBeVisible();
    await page.clock.runFor(65_000);

    await expect(page.getByTestId("host-events")).toContainText("round:1:g12");
    await expect(page.getByTestId("host-events").locator("li").filter({ hasText: /^round:/ })).toHaveCount(1);
    await page.getByRole("button", { name: "All games" }).click();
    await expect(page.getByTestId("host-events")).toContainText("aggregate:exit:1");
  });

  test("unmounting after user exit cancels the pending deadline callback", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "chromium", "The local host lifecycle journey runs once in desktop Chromium.");
    await page.clock.install({ time: FIXED_TIME });
    await page.goto("/examples/host-harness.html?remainingMs=10000");
    await expect(page.getByRole("slider")).toBeVisible();

    await page.getByRole("button", { name: "Exit" }).click();
    await expect(page.getByTestId("host-status")).toHaveText("Host returned to practice");
    await expect(page.getByTestId("host-events").locator("li")).toHaveText([
      "aggregate:exit:0",
      "return:user-exit",
      "exit:user-exit",
    ]);

    await page.clock.fastForward(15_000);
    await expect(page.getByTestId("host-events").locator("li")).toHaveCount(3);
  });

  test("keeps the host deadline authoritative while the tab is hidden", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "chromium", "The local host lifecycle journey runs once in desktop Chromium.");
    await page.clock.install({ time: FIXED_TIME });
    await page.goto("/examples/host-harness.html?remainingMs=1500");
    await expect(page.getByRole("slider")).toBeVisible();

    await setVisibility(page, "hidden");
    await expect(page.getByTestId("clock-status")).toHaveText("The host break clock continues while this tab is hidden.");
    await page.clock.fastForward(1_500);
    await expect(page.getByTestId("host-status")).toHaveText("Host returned to practice");
    await setVisibility(page, "visible");
    await expect(page.getByTestId("host-events").locator("li")).toHaveText([
      "aggregate:break-complete:0",
      "return:deadline",
    ]);
  });
});
