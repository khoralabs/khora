import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { runAtriumPostinstall } from "./postinstall.ts";

let workspace: string;
let pkgDistDir: string;
let home: string;

const BASE_BODY = JSON.stringify(
  { $schema: "./atrium-config.schema.json", baseUrl: "https://atr1.khoralabs.com", dataDir: "~/.atrium" },
  null,
  2,
);
const CLI_BODY = JSON.stringify(
  {
    $schema: "./atrium-config.schema.json",
    extends: "./base.config.json",
    plugins: { "profile-sync": { filePath: "profile.json" } },
  },
  null,
  2,
);
const DAEMON_BODY = JSON.stringify(
  {
    $schema: "./atrium-config.schema.json",
    extends: "./base.config.json",
    plugins: { "inbox-buffer": { dbPath: "inbox-buffer.sqlite" } },
  },
  null,
  2,
);
const SCHEMA_BODY = JSON.stringify({ $id: "atrium-config", type: "object" });

beforeEach(() => {
  workspace = mkdtempSync(path.join(tmpdir(), "atrium-postinstall-"));
  pkgDistDir = path.join(workspace, "dist");
  home = path.join(workspace, "home");
  mkdirSync(path.join(pkgDistDir, "configs"), { recursive: true });
  mkdirSync(home, { recursive: true });
  writeFileSync(path.join(pkgDistDir, "configs", "base.config.json"), `${BASE_BODY}\n`);
  writeFileSync(path.join(pkgDistDir, "configs", "cli.config.json"), `${CLI_BODY}\n`);
  writeFileSync(path.join(pkgDistDir, "configs", "daemon.config.json"), `${DAEMON_BODY}\n`);
  writeFileSync(path.join(pkgDistDir, "atrium-config.schema.json"), SCHEMA_BODY);
});

afterEach(() => {
  rmSync(workspace, { recursive: true, force: true });
});

describe("runAtriumPostinstall", () => {
  test("copies all configs and schema on a clean home", () => {
    const result = runAtriumPostinstall({ pkgDistDir, home });
    const dest = path.join(home, ".atrium");
    expect(result.destDir).toBe(dest);
    expect(result.copied.sort()).toEqual(["base.config.json", "cli.config.json", "daemon.config.json"]);
    expect(result.skipped).toEqual([]);
    expect(result.schemaCopied).toBe(true);
    expect(existsSync(path.join(dest, "base.config.json"))).toBe(true);
    expect(existsSync(path.join(dest, "cli.config.json"))).toBe(true);
    expect(existsSync(path.join(dest, "daemon.config.json"))).toBe(true);
    expect(existsSync(path.join(dest, "atrium-config.schema.json"))).toBe(true);
  });

  test("expands ~/.atrium to the absolute dest path in copied configs", () => {
    runAtriumPostinstall({ pkgDistDir, home });
    const dest = path.join(home, ".atrium");
    const written = readFileSync(path.join(dest, "base.config.json"), "utf8");
    const parsed = JSON.parse(written) as { dataDir: string };
    expect(parsed.dataDir).toBe(dest);
    expect(written.includes("~/.atrium")).toBe(false);
  });

  test("never overwrites existing config files", () => {
    const dest = path.join(home, ".atrium");
    mkdirSync(dest, { recursive: true });
    writeFileSync(path.join(dest, "cli.config.json"), '{"baseUrl":"https://user.example"}');
    const result = runAtriumPostinstall({ pkgDistDir, home });
    expect(result.copied.sort()).toEqual(["base.config.json", "daemon.config.json"]);
    expect(result.skipped).toEqual(["cli.config.json"]);
    const preserved = readFileSync(path.join(dest, "cli.config.json"), "utf8");
    expect(preserved).toBe('{"baseUrl":"https://user.example"}');
  });

  test("never overwrites existing schema", () => {
    const dest = path.join(home, ".atrium");
    mkdirSync(dest, { recursive: true });
    writeFileSync(path.join(dest, "atrium-config.schema.json"), '{"old":true}');
    const result = runAtriumPostinstall({ pkgDistDir, home });
    expect(result.schemaCopied).toBe(false);
    expect(readFileSync(path.join(dest, "atrium-config.schema.json"), "utf8")).toBe('{"old":true}');
  });

  test("idempotent on repeat invocations", () => {
    const first = runAtriumPostinstall({ pkgDistDir, home });
    expect(first.copied.length).toBe(3);
    expect(first.schemaCopied).toBe(true);
    const second = runAtriumPostinstall({ pkgDistDir, home });
    expect(second.copied).toEqual([]);
    expect(second.schemaCopied).toBe(false);
    expect(second.skipped.sort()).toEqual([
      "base.config.json",
      "cli.config.json",
      "daemon.config.json",
    ]);
  });

  test("creates ~/.atrium when missing", () => {
    rmSync(home, { recursive: true, force: true });
    mkdirSync(home, { recursive: true });
    expect(existsSync(path.join(home, ".atrium"))).toBe(false);
    runAtriumPostinstall({ pkgDistDir, home });
    expect(existsSync(path.join(home, ".atrium"))).toBe(true);
  });
});
