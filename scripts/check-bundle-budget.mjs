import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const baselinePath = join(repositoryRoot, "performance", "baseline.json");
const assetsPath = join(repositoryRoot, "dist", "assets");
const outputDirectory = join(repositoryRoot, "performance-results");

if (!existsSync(baselinePath)) throw new Error("performance/baseline.json is missing");
if (!existsSync(assetsPath)) throw new Error("dist/assets is missing; run the production build first");

const baseline = JSON.parse(readFileSync(baselinePath, "utf8"));
const files = readdirSync(assetsPath)
  .filter((name) => name.endsWith(".js"))
  .sort()
  .map((name) => {
    const path = join(assetsPath, name);
    const contents = readFileSync(path);
    return {
      name,
      rawBytes: statSync(path).size,
      gzipBytes: gzipSync(contents, { level: 9 }).length,
    };
  });

if (files.length === 0) throw new Error("No learner JavaScript assets were found");

const current = files.reduce(
  (total, file) => ({
    rawBytes: total.rawBytes + file.rawBytes,
    gzipBytes: total.gzipBytes + file.gzipBytes,
  }),
  { rawBytes: 0, gzipBytes: 0 },
);
const delta = {
  rawBytes: current.rawBytes - baseline.learnerJavaScript.rawBytes,
  gzipBytes: current.gzipBytes - baseline.learnerJavaScript.gzipBytes,
};
const gzipPercent = baseline.learnerJavaScript.gzipBytes === 0
  ? null
  : (delta.gzipBytes / baseline.learnerJavaScript.gzipBytes) * 100;
const allowedGzipIncrease = Math.max(
  baseline.materialIncreasePolicy.maxAbsoluteGzipBytes,
  Math.ceil(baseline.learnerJavaScript.gzipBytes * baseline.materialIncreasePolicy.maxPercent / 100),
);

const result = {
  schemaVersion: 1,
  comparisonSha: baseline.sourceSha,
  baseline: baseline.learnerJavaScript,
  current,
  delta: { ...delta, gzipPercent },
  allowedGzipIncrease,
  files,
  crux: baseline.crux,
};

mkdirSync(outputDirectory, { recursive: true });
writeFileSync(join(outputDirectory, "bundle-budget.json"), `${JSON.stringify(result, null, 2)}\n`);

console.log(
  `Learner JS gzip: ${current.gzipBytes} bytes; baseline ${baseline.learnerJavaScript.gzipBytes}; `
  + `delta ${delta.gzipBytes} (${gzipPercent?.toFixed(2) ?? "n/a"}%).`,
);

if (delta.gzipBytes > allowedGzipIncrease) {
  console.error(`Bundle budget exceeded: +${delta.gzipBytes} gzip bytes > allowed +${allowedGzipIncrease}.`);
  process.exit(1);
}
