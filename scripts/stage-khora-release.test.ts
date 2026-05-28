import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  cliLauncherSource,
  cliMetaPkgJson,
  platformPkgJson,
  SUPPORTED_TARGETS,
  stageKhoraRelease,
} from "./stage-khora-release.ts";

describe("launcher sources", () => {
  test("cli launcher: node shebang, supports the three slugs, sets KHORA_CLI_ASSETS_DIR + KHORA_CLI_VERSION", () => {
    const src = cliLauncherSource();
    expect(src.startsWith("#!/usr/bin/env node")).toBe(true);
    expect(src).toContain('"darwin-arm64"');
    expect(src).toContain('"linux-x64"');
    expect(src).toContain('"linux-arm64"');
    expect(src).toContain("KHORA_CLI_ASSETS_DIR");
    expect(src).toContain("KHORA_CLI_VERSION");
    expect(src).toContain("@khoralabs/khora-cli-");
    expect(src.includes("KHORA_DAEMON_BIN")).toBe(false);
    expect(src).toContain("spawnSync");
    expect(src).toContain('path.resolve(__dirname, "..")');
    expect(src).toContain('require(path.resolve(assetsDir, "package.json"))');
  });
});

describe("package.json factories", () => {
  test("cli meta lists the three platform optionalDependencies", () => {
    const pkg = cliMetaPkgJson({ version: "1.2.3" }) as Record<string, Record<string, string>>;
    expect((pkg as Record<string, unknown>).name).toBe("@khoralabs/khora-cli");
    expect((pkg as Record<string, unknown>).version).toBe("1.2.3");
    expect((pkg as Record<string, unknown>).dependencies).toBeUndefined();
    expect(Object.keys(pkg.optionalDependencies ?? {}).sort()).toEqual([
      "@khoralabs/khora-cli-darwin-arm64",
      "@khoralabs/khora-cli-linux-arm64",
      "@khoralabs/khora-cli-linux-x64",
    ]);
    for (const v of Object.values(pkg.optionalDependencies ?? {})) expect(v).toBe("1.2.3");
    expect(((pkg as Record<string, unknown>).bin as Record<string, string>).khora).toBe(
      "./bin/khora.cjs",
    );
    expect(((pkg as Record<string, unknown>).scripts as Record<string, string>).postinstall).toBe(
      "node ./postinstall.js",
    );
  });

  test("platform pkg.json sets os/cpu and includes only khora binary", () => {
    const t = SUPPORTED_TARGETS[0];
    const pkg = platformPkgJson({ target: t, version: "1.2.3" }) as Record<string, unknown>;
    expect(pkg.name).toBe(`@khoralabs/khora-cli-${t.slug}`);
    expect(pkg.os).toEqual([t.os]);
    expect(pkg.cpu).toEqual([t.cpu]);
    expect(pkg.files).toEqual(["khora"]);
  });
});

describe("stageKhoraRelease", () => {
  let workspace: string;
  let releaseDir: string;

  beforeEach(() => {
    workspace = mkdtempSync(path.join(tmpdir(), "khora-stage-"));
    releaseDir = path.join(workspace, "apps/khora/release");

    mkdirSync(path.join(workspace, "apps/khora/cli/scripts"), { recursive: true });
    mkdirSync(path.join(workspace, "apps/khora/cli/assets/configs"), { recursive: true });
    mkdirSync(path.join(workspace, "packages/khora/client"), { recursive: true });

    writeFileSync(
      path.join(workspace, "apps/khora/cli/scripts/postinstall.ts"),
      `import * as fs from "node:fs";
       export function runKhoraPostinstall(_: { pkgDistDir: string; home: string }) {
         return { destDir: "/tmp", copied: [], skipped: [], schemaCopied: fs.existsSync("/") };
       }
      `,
    );
    writeFileSync(
      path.join(workspace, "apps/khora/cli/scripts/postinstall.entry.ts"),
      `import { runKhoraPostinstall } from "./postinstall.ts";
       runKhoraPostinstall({ pkgDistDir: ".", home: "/tmp" });
      `,
    );

    for (const name of ["base.config.json", "cli.config.json", "daemon.config.json"]) {
      writeFileSync(
        path.join(workspace, "apps/khora/cli/assets/configs", name),
        `{ "name": "${name}" }`,
      );
    }
    writeFileSync(
      path.join(workspace, "packages/khora/client/khora-config.schema.json"),
      '{"$id":"khora-config"}',
    );
  });

  afterEach(() => {
    rmSync(workspace, { recursive: true, force: true });
  });

  test("produces 4 package directories with the expected layout", async () => {
    const result = await stageKhoraRelease({
      workspaceRoot: workspace,
      releaseDir,
      version: "9.9.9",
      copyBinaries: false,
    });

    expect(result.packages.length).toBe(4);

    for (const t of SUPPORTED_TARGETS) {
      const dir = path.join(releaseDir, `cli-${t.slug}`);
      expect(existsSync(path.join(dir, "package.json"))).toBe(true);
      const pkg = JSON.parse(readFileSync(path.join(dir, "package.json"), "utf8"));
      expect(pkg.name).toBe(`@khoralabs/khora-cli-${t.slug}`);
      expect(pkg.version).toBe("9.9.9");
      expect(pkg.os).toEqual([t.os]);
      expect(pkg.cpu).toEqual([t.cpu]);
    }

    const cliMeta = path.join(releaseDir, "cli");
    expect(existsSync(path.join(cliMeta, "package.json"))).toBe(true);
    expect(existsSync(path.join(cliMeta, "bin", "khora.cjs"))).toBe(true);
    expect(existsSync(path.join(cliMeta, "postinstall.js"))).toBe(true);
    expect(existsSync(path.join(cliMeta, "khora-config.schema.json"))).toBe(true);
    for (const name of ["base.config.json", "cli.config.json", "daemon.config.json"]) {
      expect(existsSync(path.join(cliMeta, "configs", name))).toBe(true);
    }
    const cliPkg = JSON.parse(readFileSync(path.join(cliMeta, "package.json"), "utf8"));
    expect(cliPkg.dependencies).toBeUndefined();
  });

  test("wipes existing releaseDir on re-run (idempotent)", async () => {
    mkdirSync(releaseDir, { recursive: true });
    writeFileSync(path.join(releaseDir, "stale.txt"), "x");
    expect(existsSync(path.join(releaseDir, "stale.txt"))).toBe(true);
    await stageKhoraRelease({
      workspaceRoot: workspace,
      releaseDir,
      version: "0.0.1",
      copyBinaries: false,
    });
    expect(existsSync(path.join(releaseDir, "stale.txt"))).toBe(false);
  });

  test("throws when a cross-compiled binary is missing", async () => {
    let err: Error | undefined;
    try {
      await stageKhoraRelease({
        workspaceRoot: workspace,
        releaseDir,
        version: "0.0.1",
        copyBinaries: true,
      });
    } catch (e) {
      err = e as Error;
    }
    expect(err).toBeDefined();
    expect(err?.message ?? "").toContain("missing compiled binary");
  });
});
