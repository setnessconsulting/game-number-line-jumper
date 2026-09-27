import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const packageJson = JSON.parse(readFileSync(join(repositoryRoot, "package.json"), "utf8"));
const buildRoot = join(repositoryRoot, "dist");
// Development tools can have their own telemetry dependencies; only runtime dependencies and
// built assets define what the learner downloads.
const allowedRuntimeDependencies = new Set(["react", "react-dom"]);
const blockedBundleMarker = /\b(?:phaser|pixi(?:\.js)?|unityloader|unityframework|createunityinstance|webglplayer|webgl|sentry|opentelemetry|posthog|datadog|newrelic|bugsnag|rollbar|fullstory|mixpanel|rudderstack|hotjar|clarity)\b/i;
const textExtensions = new Set([".css", ".html", ".js", ".json", ".mjs", ".svg"]);

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

const violations = [];
if (!existsSync(join(buildRoot, "index.html"))) {
  violations.push("production dist/index.html is missing; the build assertion did not run against a production build");
}

const runtimeDependencies = Object.keys(packageJson.dependencies ?? {});
const unapprovedDependencies = runtimeDependencies.filter((name) => !allowedRuntimeDependencies.has(name));
if (unapprovedDependencies.length > 0) {
  violations.push(`unapproved direct runtime dependencies: ${unapprovedDependencies.join(", ")}`);
}

const bundleFiles = filesUnder(buildRoot);
if (bundleFiles.length === 0) violations.push("production bundle is empty");
for (const file of bundleFiles) {
  const name = relative(buildRoot, file).replaceAll("\\", "/");
  if (/\.(?:wasm|data)$/i.test(name) || /(?:unity|phaser|pixi|sentry)/i.test(name)) {
    violations.push(`unapproved learner asset path: ${name}`);
  }
  if (!textExtensions.has(extname(file).toLowerCase())) continue;
  const contents = readFileSync(file, "utf8");
  const matches = contents.match(blockedBundleMarker);
  if (matches) violations.push(`unapproved runtime marker "${matches[0]}" in ${name}`);
}

if (violations.length > 0) {
  console.error("Learner bundle assertion failed:");
  for (const violation of violations) console.error(`- ${violation}`);
  process.exit(1);
}

console.log(`PASS: runtime dependency allowlist and ${bundleFiles.length} production asset(s) contain no unapproved runtime.`);
