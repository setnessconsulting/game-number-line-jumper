import { readFile } from "node:fs/promises";

const packageName = "@setnessconsulting/game-platform-sdk";
async function readJson(url) {
  const contents = await readFile(url, "utf8");
  return JSON.parse(contents.replace(/^\uFEFF/, ""));
}

const rootPackage = await readJson(new URL("../package.json", import.meta.url));
const lockfile = await readJson(new URL("../package-lock.json", import.meta.url));
const adoption = await readJson(
  new URL("../src/lib/numberLineJumper/gamePlatformSdkAdoption.json", import.meta.url),
);
const sdkPackage = await readJson(new URL(`../node_modules/${packageName}/package.json`, import.meta.url));

function gitSha(spec, label) {
  const match = String(spec).match(/#([0-9a-f]{40})$/i);
  if (!match) throw new Error(`${label} must pin the SDK to a full Git commit SHA.`);
  return match[1].toLowerCase();
}

const packageSha = gitSha(rootPackage.dependencies?.[packageName], "package.json dependency");
const locked = lockfile.packages?.[`node_modules/${packageName}`];
const lockSha = gitSha(locked?.resolved, "package-lock.json resolved dependency");

if (packageSha !== lockSha || packageSha !== adoption.sdkCommit.toLowerCase()) {
  throw new Error("The SDK dependency, lockfile, and GPSDK adoption commit must all match.");
}
if (locked.version !== sdkPackage.version) {
  throw new Error("The installed SDK version does not match the package-lock entry.");
}
if (adoption.sdkVersion !== sdkPackage.version) {
  throw new Error("The SDK version in the adoption record does not match the installed package.");
}
if (adoption.gameVersion !== rootPackage.version) {
  throw new Error("The game version in the adoption record does not match package.json.");
}
if (typeof rootPackage.version !== "string" || !rootPackage.version.trim()) {
  throw new Error("The game package must declare a non-empty version.");
}

process.stdout.write(
  `GPSDK identity is bound to game ${rootPackage.version}, SDK ${sdkPackage.version}, commit ${packageSha}.\n`,
);
