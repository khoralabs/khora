import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  maybeBootstrapKhoraHome,
  printSetupSummary,
  resolveSetupAssets,
  runSetupCommand,
} from "./setup";

describe("resolveSetupAssets", () => {
  test("uses KHORA_CLI_ASSETS_DIR when set", () => {
    const ws = mkdtempSync(path.join(tmpdir(), "khora-assets-"));
    try {
      mkdirSync(path.join(ws, "configs"), { recursive: true });
      writeFileSync(path.join(ws, "khora-config.schema.json"), "{}");
      const out = resolveSetupAssets({ KHORA_CLI_ASSETS_DIR: ws });
      expect(out.configsDir).toBe(path.join(ws, "configs"));
      expect(out.schemaPath).toBe(path.join(ws, "khora-config.schema.json"));
      expect(out.skillAssetsDir).toBe(path.join(ws, "skills", "khora-cli"));
    } finally {
      rmSync(ws, { recursive: true, force: true });
    }
  });

  test("treats empty / whitespace KHORA_CLI_ASSETS_DIR as unset (monorepo fallback)", () => {
    const out = resolveSetupAssets({ KHORA_CLI_ASSETS_DIR: "   " });
    expect(out.configsDir.endsWith(path.join("cli", "assets", "configs"))).toBe(true);
    expect(out.schemaPath?.endsWith("khora-config.schema.json")).toBe(true);
  });

  test("falls back to monorepo paths when env unset", () => {
    const out = resolveSetupAssets({});
    expect(out.configsDir.endsWith(path.join("cli", "assets", "configs"))).toBe(true);
    expect(out.schemaPath?.endsWith("khora-config.schema.json")).toBe(true);
  });
});

describe("printSetupSummary", () => {
  test("prints destDir line when no files are copied", () => {
    const lines: string[] = [];
    const log = console.log;
    console.log = (msg: unknown) => {
      lines.push(String(msg));
    };
    try {
      printSetupSummary({
        destDir: "/home/me/.khora",
        copied: [],
        overwritten: [],
        skipped: [],
        schema: "missing",
      });
    } finally {
      console.log = log;
    }
    expect(lines.at(-1)).toContain("at /home/me/.khora");
  });
});

describe("runSetupCommand", () => {
  let workspace: string;
  let home: string;
  let origEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    workspace = mkdtempSync(path.join(tmpdir(), "khora-setup-cmd-"));
    home = path.join(workspace, "home");
    mkdirSync(home, { recursive: true });
    origEnv = { ...process.env };
    process.env.HOME = home;
    process.env.USERPROFILE = home;
  });

  afterEach(() => {
    rmSync(workspace, { recursive: true, force: true });
    process.env = origEnv;
  });

  test("creates ~/.khora on first run", async () => {
    await runSetupCommand({});
    expect(existsSync(path.join(home, ".khora"))).toBe(true);
    expect(existsSync(path.join(home, ".agents", "skills", "khora-cli", "SKILL.md"))).toBe(true);
  });

  test("idempotent: second run still succeeds", async () => {
    await runSetupCommand({});
    await runSetupCommand({});
    expect(existsSync(path.join(home, ".khora"))).toBe(true);
  });

  test("--json emits structured result", async () => {
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
    const parsed = JSON.parse(lines.join("\n")) as { destDir: string };
    expect(parsed.destDir).toBe(path.join(home, ".khora"));
  });
});

describe("maybeBootstrapKhoraHome", () => {
  let workspace: string;
  let home: string;
  let assetsDir: string;

  beforeEach(() => {
    workspace = mkdtempSync(path.join(tmpdir(), "khora-bootstrap-"));
    home = path.join(workspace, "home");
    assetsDir = path.join(workspace, "assets");
    mkdirSync(home, { recursive: true });
    mkdirSync(path.join(assetsDir, "configs"), { recursive: true });
    mkdirSync(path.join(assetsDir, "skills", "khora-cli", "references"), { recursive: true });
    for (const name of ["base.config.json", "cli.config.json", "daemon.config.json"]) {
      writeFileSync(path.join(assetsDir, "configs", name), "{}\n");
    }
    writeFileSync(path.join(assetsDir, "khora-config.schema.json"), '{"$id":"x"}');
    writeFileSync(path.join(assetsDir, "skills", "khora-cli", "SKILL.md"), "# skill\n");
    writeFileSync(path.join(assetsDir, "skills", "khora-cli", "references", "commands.md"), "#\n");
  });

  afterEach(() => {
    rmSync(workspace, { recursive: true, force: true });
  });

  test("creates ~/.khora on first invocation in a packaged install", () => {
    const errors: string[] = [];
    maybeBootstrapKhoraHome({ KHORA_CLI_ASSETS_DIR: assetsDir, HOME: home }, (line) =>
      errors.push(line),
    );
    expect(existsSync(path.join(home, ".khora", "cli.config.json"))).toBe(true);
    expect(existsSync(path.join(home, ".agents", "skills", "khora-cli", "SKILL.md"))).toBe(true);
    expect(errors).toEqual([]);
  });

  test("short-circuits when canary cli.config.json already exists", () => {
    mkdirSync(path.join(home, ".khora"), { recursive: true });
    writeFileSync(path.join(home, ".khora", "cli.config.json"), '{"keep":true}');
    maybeBootstrapKhoraHome({ KHORA_CLI_ASSETS_DIR: assetsDir, HOME: home });
    expect(readFileSync(path.join(home, ".khora", "cli.config.json"), "utf8")).toBe(
      '{"keep":true}',
    );
  });

  test("no-op when KHORA_CLI_ASSETS_DIR is unset (monorepo dev path)", () => {
    maybeBootstrapKhoraHome({ HOME: home });
    expect(existsSync(path.join(home, ".khora"))).toBe(false);
  });

  test("never throws; surfaces failures as a one-line stderr message", () => {
    unlinkSync(path.join(assetsDir, "configs", "base.config.json"));
    const errors: string[] = [];
    expect(() =>
      maybeBootstrapKhoraHome({ KHORA_CLI_ASSETS_DIR: assetsDir, HOME: home }, (line) =>
        errors.push(line),
      ),
    ).not.toThrow();
    expect(errors.length).toBeGreaterThan(0);
    expect(String(errors[0])).toContain("first-run setup failed");
    expect(String(errors[0])).toContain("khora setup");
  });
});
