import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { join, relative, sep } from "node:path";

const GAME_SLUG = "number-line-jumper";
const ENTRY_FILE = "index.html";
const DIST_DIR = "dist";
const VERSION_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

function readArg(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function sha256(content) {
  return createHash("sha256").update(content).digest("hex");
}

async function collectFiles(root, current = root) {
  const entries = await readdir(current, { withFileTypes: true });
  const files = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const absolute = join(current, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectFiles(root, absolute)));
    } else if (entry.isFile()) {
      const content = await readFile(absolute);
      const info = await stat(absolute);
      files.push({
        path: relative(root, absolute).split(sep).join("/"),
        size: info.size,
        sha256: sha256(content),
      });
    }
  }
  return files;
}

function resolveSourceSha() {
  if (process.env.GITHUB_SHA) return process.env.GITHUB_SHA;
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  } catch {
    throw new Error("Unable to resolve source SHA. Set GITHUB_SHA or run inside a Git checkout.");
  }
}

const version = readArg("--version");
if (!version || !VERSION_PATTERN.test(version)) {
  throw new Error("Usage: npm run release:evidence -- --version <immutable-version>");
}

const files = await collectFiles(DIST_DIR);
if (!files.some((file) => file.path === ENTRY_FILE)) {
  throw new Error(`Production build is missing required entry file ${ENTRY_FILE}`);
}

const buildHasher = createHash("sha256");
for (const file of files) {
  buildHasher.update(file.path);
  buildHasher.update("\0");
  buildHasher.update(file.sha256);
  buildHasher.update("\0");
  buildHasher.update(String(file.size));
  buildHasher.update("\n");
}

const lockfile = await readFile("package-lock.json");
const sourceSha = resolveSourceSha();
const manifest = {
  schemaVersion: 1,
  gameSlug: GAME_SLUG,
  releaseKind: "static-web",
  version,
  sourceSha,
  lockfileSha256: sha256(lockfile),
  buildSha256: buildHasher.digest("hex"),
  entryFile: ENTRY_FILE,
  publishedAssetPrefix: `/game-assets/${GAME_SLUG}/${version}`,
  generatedAt: new Date().toISOString(),
  files,
};

await mkdir("release-evidence", { recursive: true });
const output = join("release-evidence", `${GAME_SLUG}-${version}.json`);
await writeFile(output, JSON.stringify(manifest, null, 2) + "\n", "utf8");
console.log(output);
