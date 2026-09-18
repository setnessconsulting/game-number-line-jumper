import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const baseline = JSON.parse(readFileSync(join(root, "performance", "baseline.json"), "utf8"));
const assets = join(root, "dist", "assets");
if (!existsSync(assets)) throw new Error("dist/assets is missing; run the production build first.");

const jsFiles = readdirSync(assets)
  .filter((name) => name.endsWith(".js"))
  .sort()
  .map((name) => {
    const path = join(assets, name);
    const bytes = statSync(path).size;
    const gzipBytes = gzipSync(readFileSync(path), { level: 9 }).length;
    return { name, bytes, gzipBytes };
  });

if (jsFiles.length === 0) throw new Error("No learner JavaScript assets were found.");

const current = jsFiles.reduce(
  (total, file) => ({ rawBytes: total.rawBytes + file.bytes, gzipBytes: total.gzipBytes + file.gzipBytes }),
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
  files: jsFiles,
  crux: baseline.crux,
};

mkdirSync(join(root, "performance-results"), { recursive: true });
writeFileSync(join(root, "performance-results", "bundle-budget.json"), JSON.stringify(result, null, 2) + "\n");

console.log(
  `Learner JS gzip: ${current.gzipBytes} bytes; baseline ${baseline.learnerJavaScript.gzipBytes}; delta ${delta.gzipBytes} (${gzipPercent?.toFixed(2) ?? "n/a"}%).`,
);

if (delta.gzipBytes > allowedGzipIncrease) {
  console.error(`Bundle budget exceeded: +${delta.gzipBytes} gzip bytes > allowed +${allowedGzipIncrease}.`);
  process.exit(1);
}
