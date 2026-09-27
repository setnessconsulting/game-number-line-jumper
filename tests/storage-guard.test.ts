import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const STORE = join(ROOT, "src", "lib", "numberLineJumper", "sessionStore.ts");
const SHELL = join(ROOT, "src", "app", "games", "NumberLineJumper.tsx");
const PURE_FILES = [
  join(ROOT, "src", "lib", "numberLineJumper", "engine.ts"),
  join(ROOT, "src", "lib", "numberLineJumper", "adaptive.ts"),
  join(ROOT, "src", "lib", "numberLineJumper", "aggregates.ts"),
  join(ROOT, "src", "lib", "numberLineJumper", "visitBests.ts"),
];

const REMOTE_OR_IDENTITY = [
  /localStorage/,
  /indexedDB/,
  /document\.cookie/,
  /\bfetch\s*\(/,
  /\bXMLHttpRequest\b/,
  /\bWebSocket\s*\(/,
  /\bEventSource\s*\(/,
  /navigator\.sendBeacon/,
  /\b(userId|user_id|accountId|account_id|childId|child_id|email|deviceFingerprint)\b/i,
];

describe("session storage boundary", () => {
  it("keeps browser-tab storage access in the guarded store module", () => {
    expect(readFileSync(STORE, "utf8")).toContain("sessionStorage");
    expect(readFileSync(SHELL, "utf8")).not.toContain("sessionStorage");
    for (const file of PURE_FILES) {
      expect(readFileSync(file, "utf8"), file).not.toContain("sessionStorage");
    }
  });

  it("keeps the store free of network and identity fields", () => {
    const source = readFileSync(STORE, "utf8");
    for (const pattern of REMOTE_OR_IDENTITY) {
      expect(source, `sessionStore.ts must not match ${pattern}`).not.toMatch(pattern);
    }
  });

  it("documents the versioned key and expiry boundary", () => {
    const source = readFileSync(STORE, "utf8");
    expect(source).toContain('SESSION_STORE_KEY = "number-line-jumper.session.v1"');
    expect(source).toContain("MAX_RESUME_AGE_MS");
    expect(source).toContain("SESSION_RECORDS_ENABLED");
  });
});
