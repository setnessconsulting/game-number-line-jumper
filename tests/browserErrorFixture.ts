import { expect, test as base } from "@playwright/test";

type BrowserErrorFixtures = {
  browserErrorGate: void;
};

export const test = base.extend<BrowserErrorFixtures>({
  browserErrorGate: [
    async ({ page }, use, testInfo) => {
      const errors: string[] = [];
      page.on("console", (message) => {
        if (message.type() === "error") errors.push(`console.error: ${message.text()}`);
      });
      page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));

      await use();
      expect(errors, `Browser console/page errors in ${testInfo.title}`).toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };
