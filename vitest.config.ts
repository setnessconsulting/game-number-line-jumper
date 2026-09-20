import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    include: ["tests/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: [
        "src/lib/numberLineJumper/engine.ts",
        "src/lib/numberLineJumper/aggregates.ts",
        "src/lib/numberLineJumper/adaptive.ts",
        "src/lib/numberLineJumper/visitBests.ts",
        "src/lib/numberLineJumper/sessionStore.ts",
        "src/lib/numberLineJumper/sound.ts",
        "src/lib/numberLineJumper/explorePrompt.ts",
        "src/lib/numberLineJumper/hostContract.ts",
        "src/lib/numberLineJumper/placementAdapter.ts",
        "src/lib/numberLineJumper/skills.ts",
        "src/lib/numberLineJumper/sessionClock.ts",
        "src/lib/games/shared/rng.ts",
      ],
      reporter: ["text", "json-summary", "lcov"],
      thresholds: {
        lines: 90,
        branches: 90,
        functions: 90,
        perFile: true,
      },
    },
  },
});
