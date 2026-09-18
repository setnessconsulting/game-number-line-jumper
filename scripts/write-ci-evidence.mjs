import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, "utf8"));
const workflowSha = process.env.GITHUB_SHA ?? "unknown";
const testedSourceSha = event.pull_request?.head?.sha ?? workflowSha;
const packageJson = JSON.parse(readFileSync(join(repositoryRoot, "package.json"), "utf8"));
const packageLock = readFileSync(join(repositoryRoot, "package-lock.json"));
const packageLockJson = JSON.parse(packageLock.toString("utf8"));
const browserManifestPath = join(repositoryRoot, "node_modules", "playwright-core", "browsers.json");
const browserManifest = existsSync(browserManifestPath)
  ? JSON.parse(readFileSync(browserManifestPath, "utf8"))
  : null;
const requiredBrowsers = browserManifest?.browsers
  ?.filter(({ name }) => name === "chromium" || name === "webkit")
  .map(({ name, revision, browserVersion, title }) => ({ name, revision, browserVersion, title })) ?? null;

function status(name) {
  const value = process.env[name];
  if (value === "success") return "passed";
  if (value === "failure") return "failed";
  if (value === "cancelled") return "cancelled";
  return "not-run";
}

function treeFiles(root) {
  if (!existsSync(root)) return [];
  const stat = statSync(root);
  if (stat.isFile()) return [root];
  if (!stat.isDirectory()) return [];
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = join(root, entry.name);
    return entry.isDirectory() ? treeFiles(path) : entry.isFile() ? [path] : [];
  });
}

function treeDigest(path) {
  const root = join(repositoryRoot, path);
  const files = treeFiles(root).sort((left, right) => left < right ? -1 : left > right ? 1 : 0);
  if (files.length === 0) return null;
  const fileDigests = files.map((file) => {
    const contents = readFileSync(file);
    const sha256 = createHash("sha256").update(contents).digest("hex");
    return { path: relative(repositoryRoot, file).replaceAll("\\", "/"), sizeBytes: contents.length, sha256 };
  });
  const aggregate = createHash("sha256");
  for (const file of fileDigests) aggregate.update(`${file.path}\0${file.sha256}\0${file.sizeBytes}\n`);
  return { sha256: aggregate.digest("hex"), files: fileDigests };
}

const coveragePath = join(repositoryRoot, "coverage", "coverage-summary.json");
const coverage = existsSync(coveragePath) ? JSON.parse(readFileSync(coveragePath, "utf8")).total : null;
const checks = {
  dependencyInstall: status("GATE_NPM_CI"),
  typecheck: status("GATE_TYPECHECK"),
  lint: status("GATE_LINT"),
  unitAndCoverage: status("GATE_COVERAGE"),
  productionBuild: status("GATE_BUILD"),
  hostHarnessBuild: status("GATE_HOST_BUILD"),
  ipSeparation: status("GATE_IP"),
  learnerBundle: status("GATE_BUNDLE"),
  browserJourneys: status("BROWSER_E2E"),
  accessibility: status("BROWSER_A11Y"),
  hostLifecycle: status("BROWSER_HOST"),
};
const browserJobStatus = process.env.BROWSER_JOB_RESULT ?? "not-run";
const browserSuitesStarted = Boolean(process.env.BROWSER_E2E || process.env.BROWSER_A11Y || process.env.BROWSER_HOST);
const codeChanged = process.env.GAME_CODE_CHANGED === "true";
const fullBrowserQualification = browserJobStatus === "success";
const verificationPassed = process.env.VERIFY_JOB_RESULT === "success";

const manifest = {
  schemaVersion: 1,
  repository: process.env.GITHUB_REPOSITORY ?? "setnessconsulting/game-number-line-jumper",
  testedSourceSha,
  workflowSha,
  run: {
    id: process.env.GITHUB_RUN_ID ?? null,
    attempt: Number(process.env.GITHUB_RUN_ATTEMPT ?? "1"),
    event: process.env.GITHUB_EVENT_NAME ?? "unknown",
    ref: process.env.GITHUB_REF ?? "unknown",
    url: `https://github.com/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`,
    verificationArtifact: verificationPassed ? `game-verification-${workflowSha}` : null,
    browserArtifact: browserSuitesStarted ? `game-browser-results-${workflowSha}` : null,
  },
  toolchain: {
    node: process.version,
    npm: process.env.NPM_VERSION ?? null,
    vitest: packageJson.devDependencies?.vitest ?? null,
    playwright: packageJson.devDependencies?.["@playwright/test"] ?? null,
    playwrightCore: packageLockJson.packages?.["node_modules/playwright-core"]?.version ?? null,
    browsers: requiredBrowsers,
  },
  packageLockSha256: createHash("sha256").update(packageLock).digest("hex"),
  productionBuild: treeDigest("dist"),
  coverage: coverage
    ? {
        linesPercent: coverage.lines?.pct ?? null,
        branchesPercent: coverage.branches?.pct ?? null,
        functionsPercent: coverage.functions?.pct ?? null,
      }
    : null,
  jobs: {
    changeClassification: process.env.CHANGE_JOB_RESULT ?? "not-run",
    verification: process.env.VERIFY_JOB_RESULT ?? "not-run",
    browser: browserJobStatus,
  },
  checks,
  browserQualification: {
    status: fullBrowserQualification
      ? "passed"
      : browserJobStatus === "failure"
        ? "failed"
        : browserJobStatus === "skipped" && !codeChanged
          ? "skipped-docs-only"
          : "incomplete",
    projects: ["chromium", "mobile-webkit"],
    manualWorkflowDispatchRunsFullMatrix: true,
  },
  verificationStage: !verificationPassed
    ? "failed-or-incomplete"
    : fullBrowserQualification
      ? "full-browser-and-accessibility"
      : browserJobStatus === "failure"
        ? "static-and-unit-passed-browser-failed"
        : browserJobStatus === "cancelled"
          ? "browser-qualification-cancelled"
          : "static-and-unit-only",
  note: "This artifact records this CI run only; it is not final release acceptance and does not imply GAME-219, owner, host-deployment, or publication gates are complete.",
};

const outputDirectory = join(repositoryRoot, "ci-evidence");
mkdirSync(outputDirectory, { recursive: true });
writeFileSync(join(outputDirectory, "ci-evidence.json"), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Wrote CI evidence for source ${testedSourceSha} and workflow ${workflowSha}.`);
