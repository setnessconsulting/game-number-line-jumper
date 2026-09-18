import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const textExtensions = new Set([
  ".cjs",
  ".css",
  ".html",
  ".js",
  ".json",
  ".mjs",
  ".svg",
  ".ts",
  ".tsx",
  ".txt",
  ".webmanifest",
  ".xml",
]);

// Benchmark and legacy-host references belong in clearly separated docs/tests,
// never in shipped application source, public assets, or the production build.
const protectedTerms = [
  ["legacy host/publisher", /\blevelbest\b/i],
  ["legacy issue identifier", /\b(?:LEVELBEST|MD)-\d+\b/i],
  ["benchmark comparator", /\bpearl[\s_-]*diver\b/i],
  ["benchmark comparator", /\bmotion[\s_-]*math[\s_-]*zoom\b/i],
  ["benchmark comparator", /\bbattleship[\s_-]+numberline\b/i],
  ["benchmark comparator", /\bnumber[\s_-]+line[\s_-]+drop\b/i],
  ["benchmark comparator", /\bestimate[\s_-]+it\b/i],
  ["benchmark publisher", /\btoy[\s_-]+theater\b/i],
  ["benchmark publisher", /\bplaypower\b/i],
];

function filesUnder(path) {
  if (!existsSync(path)) return [];
  const stat = statSync(path);
  if (stat.isFile()) return [path];
  if (!stat.isDirectory()) return [];
  return readdirSync(path, { withFileTypes: true }).flatMap((entry) => {
    const child = join(path, entry.name);
    return entry.isDirectory() ? filesUnder(child) : entry.isFile() ? [child] : [];
  });
}

const requiredBuild = resolve(repositoryRoot, "dist");
if (!existsSync(join(requiredBuild, "index.html"))) {
  console.error("IP separation scan requires the production build; run `npm run build` first.");
  process.exit(1);
}

const scanRoots = ["src", "public", "index.html", "dist"]
  .map((path) => resolve(repositoryRoot, path))
  .filter(existsSync);
const violations = [];

for (const file of scanRoots.flatMap(filesUnder)) {
  const pathText = relative(repositoryRoot, file).replaceAll("\\", "/");
  const byName = protectedTerms.find(([, pattern]) => pattern.test(pathText));
  if (byName) violations.push(`${pathText}: filename contains a ${byName[0]} term`);

  if (!textExtensions.has(extname(file).toLowerCase())) continue;
  const content = readFileSync(file, "utf8");
  if (content.includes("\0")) continue;
  for (const [category, pattern] of protectedTerms) {
    pattern.lastIndex = 0;
    for (const match of content.matchAll(new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`))) {
      const line = content.slice(0, match.index).split(/\r?\n/).length;
      violations.push(`${pathText}:${line}: ${category} term is not allowed in shipped source/assets`);
    }
  }
}

if (violations.length > 0) {
  console.error("IP separation scan failed:");
  for (const violation of violations) console.error(`- ${violation}`);
  process.exit(1);
}

console.log("PASS: shipped source, public assets, app shell, and production bundle contain no protected benchmark/legacy identifiers.");
console.log("Benchmark/provenance documentation remains separate under README.md and docs/ and is intentionally outside this shipping scan.");
