import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { printSetupSummary, resolveSetupAssets, runSetupCommand } from "./setup.ts";

describe("resolveSetupAssets", () => {
  test("uses ATRIUM_CLI_ASSETS_DIR when set; schema present", () => {
    const ws = mkdtempSync(path.join(tmpdir(), "atrium-assets-"));
    try {
      mkdirSync(path.join(ws, "configs"), { recursive: true });
      writeFileSync(path.join(ws, "atrium-config.schema.json"), "{}");
      const out = resolveSetupAssets({ ATRIUM_CLI_ASSETS_DIR: ws });
      expect(out.configsDir).toBe(path.join(ws, "configs"));
      expect(out.schemaPath).toBe(path.join(ws, "atrium-config.schema.json"));
    } finally {
      rmSync(ws, { recursive: true, force: true });
    }
  });

  test("uses ATRIUM_CLI_ASSETS_DIR but returns schemaPath=undefined when schema missing", () => {
    const ws = mkdtempSync(path.join(tmpdir(), "atrium-assets-"));
    try {
      mkdirSync(path.join(ws, "configs"), { recursive: true });
      const out = resolveSetupAssets({ ATRIUM_CLI_ASSETS_DIR: ws });
      expect(out.configsDir).toBe(path.join(ws, "configs"));
      expect(out.schemaPath).toBeUndefined();
    } finally {
      rmSync(ws, { recursive: true, force: true });
    }
  });

  test("treats empty / whitespace ATRIUM_CLI_ASSETS_DIR as unset (falls back to monorepo paths)", () => {
    const out = resolveSetupAssets({ ATRIUM_CLI_ASSETS_DIR: "   " });
    expect(out.configsDir.endsWith(path.join("cli", "assets", "configs"))).toBe(true);
  });

  test("falls back to monorepo paths when env unset", () => {
    const out = resolveSetupAssets({});
    expect(out.configsDir.endsWith(path.join("cli", "assets", "configs"))).toBe(true);
  });
});

describe("printSetupSummary", () => {
  test("formats lines for each category and includes destDir", () => {
    const lines: string[] = [];
    const log = console.log;
    console.log = (msg: unknown) => {
      lines.push(String(msg));
    };
    try {
      printSetupSummary({
        destDir: "/home/me/.atrium",
        copied: ["base.config.json"],
        overwritten: ["cli.config.json"],
        skipped: ["daemon.config.json"],
        schema: "copied",
      });
    } finally {
      console.log = log;
    }
    expect(lines[0]).toBe("wrote base.config.json");
    expect(lines[1]).toBe("overwrote cli.config.json");
    expect(lines[2]).toBe("skipped daemon.config.json (exists; use --force to overwrite)");
    expect(lines[3]).toBe("wrote atrium-config.schema.json");
    expect(lines.at(-1)).toBe("at /home/me/.atrium");
  });

  test("renders schema='missing' with the dev hint", () => {
    const lines: string[] = [];
    const log = console.log;
    console.log = (msg: unknown) => {
      lines.push(String(msg));
    };
    try {
      printSetupSummary({
        destDir: "/h",
        copied: [],
        overwritten: [],
        skipped: [],
        schema: "missing",
      });
    } finally {
      console.log = log;
    }
    expect(lines.some((l) => l.includes("atrium-config.schema.json") && l.includes("source not found"))).toBe(
      true,
    );
  });
});

describe("runSetupCommand", () => {
  let workspace: string;
  let home: string;
  let assetsDir: string;
  let origEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    workspace = mkdtempSync(path.join(tmpdir(), "atrium-setup-cmd-"));
    home = path.join(workspace, "home");
    assetsDir = path.join(workspace, "assets");
    mkdirSync(home, { recursive: true });
    mkdirSync(path.join(assetsDir, "configs"), { recursive: true });
    writeFileSync(
      path.join(assetsDir, "configs", "base.config.json"),
      `${JSON.stringify({ dataDir: "~/.atrium" })}\n`,
    );
    writeFileSync(path.join(assetsDir, "configs", "cli.config.json"), "{}\n");
    writeFileSync(path.join(assetsDir, "configs", "daemon.config.json"), "{}\n");
    writeFileSync(path.join(assetsDir, "atrium-config.schema.json"), '{"$id":"x"}');
    origEnv = { ...process.env };
    process.env.HOME = home;
    process.env.USERPROFILE = home;
    process.env.ATRIUM_CLI_ASSETS_DIR = assetsDir;
  });

  afterEach(() => {
    rmSync(workspace, { recursive: true, force: true });
    process.env = origEnv;
  });

  test("idempotent: first run copies all files, second run skips them", async () => {
    const lines: string[] = [];
    const log = console.log;
    console.log = (msg: unknown) => {
      lines.push(String(msg));
    };
    try {
      await runSetupCommand({});
      const dest = path.join(home, ".atrium");
      expect(existsSync(path.join(dest, "base.config.json"))).toBe(true);
      expect(existsSync(path.join(dest, "cli.config.json"))).toBe(true);
      expect(existsSync(path.join(dest, "daemon.config.json"))).toBe(true);
      expect(existsSync(path.join(dest, "atrium-config.schema.json"))).toBe(true);
      lines.length = 0;
      await runSetupCommand({});
      expect(lines.some((l) => l.includes("skipped base.config.json"))).toBe(true);
      expect(lines.some((l) => l.includes("skipped atrium-config.schema.json"))).toBe(true);
    } finally {
      console.log = log;
    }
  });

  test("--force overwrites existing files", async () => {
    const dest = path.join(home, ".atrium");
    mkdirSync(dest, { recursive: true });
    writeFileSync(path.join(dest, "cli.config.json"), '{"old":true}');
    const lines: string[] = [];
    const log = console.log;
    console.log = (msg: unknown) => {
      lines.push(String(msg));
    };
    try {
      await runSetupCommand({ force: true });
    } finally {
      console.log = log;
    }
    expect(readFileSync(path.join(dest, "cli.config.json"), "utf8")).not.toBe('{"old":true}');
    expect(lines.some((l) => l === "overwrote cli.config.json")).toBe(true);
  });

  test("--json emits the structured result", async () => {
    const lines: string[] = [];
    const log = console.log;
    console.log = (msg: unknown) => {
      lines.push(String(msg));
    };
    try {
      await runSetupCommand({ json: true });
    } finally {
      console.log = log;
    }
    const parsed = JSON.parse(lines.join("\n"));
    expect(parsed.destDir).toBe(path.join(home, ".atrium"));
    expect(parsed.copied.sort()).toEqual(["base.config.json", "cli.config.json", "daemon.config.json"]);
    expect(parsed.schema).toBe("copied");
  });

  test("throws when HOME and USERPROFILE are both unset", async () => {
    process.env.HOME = "";
    process.env.USERPROFILE = "";
    let err: Error | undefined;
    try {
      await runSetupCommand({});
    } catch (e) {
      err = e as Error;
    }
    expect(err?.message ?? "").toContain("HOME");
  });

  test("throws when the assets configs directory does not exist", async () => {
    process.env.ATRIUM_CLI_ASSETS_DIR = path.join(workspace, "no-such-dir");
    let err: Error | undefined;
    try {
      await runSetupCommand({});
    } catch (e) {
      err = e as Error;
    }
    expect(err?.message ?? "").toContain("canonical configs directory not found");
  });
});
