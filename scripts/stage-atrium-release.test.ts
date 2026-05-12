import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  cliLauncherSource,
  cliMetaPkgJson,
  daemonLauncherSource,
  daemonMetaPkgJson,
  platformPkgJson,
  SUPPORTED_TARGETS,
  stageAtriumRelease,
} from "./stage-atrium-release.ts";

describe("launcher sources", () => {
  test("cli launcher: node shebang, supports the three slugs, sets ATRIUM_DAEMON_BIN + ATRIUM_CLI_ASSETS_DIR + ATRIUM_CLI_VERSION", () => {
    const src = cliLauncherSource();
    expect(src.startsWith("#!/usr/bin/env node")).toBe(true);
    expect(src).toContain('"darwin-arm64"');
    expect(src).toContain('"linux-x64"');
    expect(src).toContain('"linux-arm64"');
    expect(src).toContain("ATRIUM_DAEMON_BIN");
    expect(src).toContain("ATRIUM_CLI_ASSETS_DIR");
    expect(src).toContain("ATRIUM_CLI_VERSION");
    expect(src).toContain("@khoralabs/atrium-cli-");
    expect(src).toContain("@khoralabs/atrium-daemon-");
    expect(src).toContain("spawnSync");
    expect(src).toContain('path.resolve(__dirname, "..")');
    // Version stamping: launcher reads its meta package.json
    expect(src).toContain('require(path.resolve(assetsDir, "package.json"))');
  });

  test("daemon launcher: node shebang, supports the three slugs, no ATRIUM_DAEMON_BIN export", () => {
    const src = daemonLauncherSource();
    expect(src.startsWith("#!/usr/bin/env node")).toBe(true);
    expect(src).toContain('"darwin-arm64"');
    expect(src).toContain('"linux-x64"');
    expect(src).toContain('"linux-arm64"');
    expect(src).toContain("@khoralabs/atrium-daemon-");
    expect(src.includes("ATRIUM_DAEMON_BIN")).toBe(false);
  });
});

describe("package.json factories", () => {
  test("cli meta lists the three platform optionalDependencies + daemon meta dep", () => {
    const pkg = cliMetaPkgJson({ version: "1.2.3" }) as Record<string, Record<string, string>>;
    expect((pkg as Record<string, unknown>).name).toBe("@khoralabs/atrium-cli");
    expect((pkg as Record<string, unknown>).version).toBe("1.2.3");
    expect(pkg.dependencies?.["@khoralabs/atrium-daemon"]).toBe("1.2.3");
    expect(Object.keys(pkg.optionalDependencies ?? {}).sort()).toEqual([
      "@khoralabs/atrium-cli-darwin-arm64",
      "@khoralabs/atrium-cli-linux-arm64",
      "@khoralabs/atrium-cli-linux-x64",
    ]);
    for (const v of Object.values(pkg.optionalDependencies ?? {})) expect(v).toBe("1.2.3");
    expect(((pkg as Record<string, unknown>).bin as Record<string, string>).atrium).toBe(
      "./bin/atrium.cjs",
    );
    expect(((pkg as Record<string, unknown>).scripts as Record<string, string>).postinstall).toBe(
      "node ./postinstall.js",
    );
  });

  test("daemon meta lists three platform optionalDependencies + no transitive dep", () => {
    const pkg = daemonMetaPkgJson({ version: "1.2.3" }) as Record<string, Record<string, string>>;
    expect((pkg as Record<string, unknown>).name).toBe("@khoralabs/atrium-daemon");
    expect(Object.keys(pkg.optionalDependencies ?? {}).sort()).toEqual([
      "@khoralabs/atrium-daemon-darwin-arm64",
      "@khoralabs/atrium-daemon-linux-arm64",
      "@khoralabs/atrium-daemon-linux-x64",
    ]);
    expect((pkg as Record<string, unknown>).dependencies).toBeUndefined();
    expect(((pkg as Record<string, unknown>).bin as Record<string, string>)["atrium-daemon"]).toBe(
      "./bin/atrium-daemon.cjs",
    );
  });

  test("platform pkg.json sets os/cpu and includes only its binary", () => {
    const t = SUPPORTED_TARGETS[0];
    const pkg = platformPkgJson({ kind: "cli", target: t, version: "1.2.3" }) as Record<
      string,
      unknown
    >;
    expect(pkg.name).toBe(`@khoralabs/atrium-cli-${t.slug}`);
    expect(pkg.os).toEqual([t.os]);
    expect(pkg.cpu).toEqual([t.cpu]);
    expect(pkg.files).toEqual(["atrium"]);
    const daemonPkg = platformPkgJson({ kind: "daemon", target: t, version: "1.2.3" }) as Record<
      string,
      unknown
    >;
    expect(daemonPkg.name).toBe(`@khoralabs/atrium-daemon-${t.slug}`);
    expect(daemonPkg.files).toEqual(["atrium-daemon"]);
  });
});

describe("stageAtriumRelease", () => {
  let workspace: string;
  let releaseDir: string;

  beforeEach(() => {
    workspace = mkdtempSync(path.join(tmpdir(), "atrium-stage-"));
    releaseDir = path.join(workspace, "apps/atrium/release");

    // Stub workspace inputs that the staging script reads.
    mkdirSync(path.join(workspace, "apps/atrium/cli/scripts"), { recursive: true });
    mkdirSync(path.join(workspace, "apps/atrium/cli/assets/configs"), { recursive: true });
    mkdirSync(path.join(workspace, "apps/atrium/client"), { recursive: true });

    // Minimal postinstall library + entry stubs that bundle fine with target=node.
    writeFileSync(
      path.join(workspace, "apps/atrium/cli/scripts/postinstall.ts"),
      `import * as fs from "node:fs";
       export function runAtriumPostinstall(_: { pkgDistDir: string; home: string }) {
         return { destDir: "/tmp", copied: [], skipped: [], schemaCopied: fs.existsSync("/") };
       }
      `,
    );
    writeFileSync(
      path.join(workspace, "apps/atrium/cli/scripts/postinstall.entry.ts"),
      `import { runAtriumPostinstall } from "./postinstall.ts";
       runAtriumPostinstall({ pkgDistDir: ".", home: "/tmp" });
      `,
    );

    for (const name of ["base.config.json", "cli.config.json", "daemon.config.json"]) {
      writeFileSync(
        path.join(workspace, "apps/atrium/cli/assets/configs", name),
        `{ "name": "${name}" }`,
      );
    }
    writeFileSync(
      path.join(workspace, "apps/atrium/client/atrium-config.schema.json"),
      '{"$id":"atrium-config"}',
    );
  });

  afterEach(() => {
    rmSync(workspace, { recursive: true, force: true });
  });

  test("produces 8 package directories with the expected layout", async () => {
    const result = await stageAtriumRelease({
      workspaceRoot: workspace,
      releaseDir,
      version: "9.9.9",
      copyBinaries: false,
    });

    expect(result.packages.length).toBe(8);

    // Platform pkgs
    for (const t of SUPPORTED_TARGETS) {
      for (const kind of ["cli", "daemon"] as const) {
        const dir = path.join(releaseDir, `${kind}-${t.slug}`);
        expect(existsSync(path.join(dir, "package.json"))).toBe(true);
        const pkg = JSON.parse(readFileSync(path.join(dir, "package.json"), "utf8"));
        expect(pkg.name).toBe(`@khoralabs/atrium-${kind}-${t.slug}`);
        expect(pkg.version).toBe("9.9.9");
        expect(pkg.os).toEqual([t.os]);
        expect(pkg.cpu).toEqual([t.cpu]);
      }
    }

    // Daemon meta
    const daemonMeta = path.join(releaseDir, "daemon");
    expect(existsSync(path.join(daemonMeta, "package.json"))).toBe(true);
    expect(existsSync(path.join(daemonMeta, "bin", "atrium-daemon.cjs"))).toBe(true);
    expect(
      readFileSync(path.join(daemonMeta, "bin", "atrium-daemon.cjs"), "utf8").startsWith(
        "#!/usr/bin/env node",
      ),
    ).toBe(true);

    // Cli meta
    const cliMeta = path.join(releaseDir, "cli");
    expect(existsSync(path.join(cliMeta, "package.json"))).toBe(true);
    expect(existsSync(path.join(cliMeta, "bin", "atrium.cjs"))).toBe(true);
    expect(existsSync(path.join(cliMeta, "postinstall.js"))).toBe(true);
    expect(existsSync(path.join(cliMeta, "atrium-config.schema.json"))).toBe(true);
    for (const name of ["base.config.json", "cli.config.json", "daemon.config.json"]) {
      expect(existsSync(path.join(cliMeta, "configs", name))).toBe(true);
    }
    const cliPkg = JSON.parse(readFileSync(path.join(cliMeta, "package.json"), "utf8"));
    expect(cliPkg.dependencies["@khoralabs/atrium-daemon"]).toBe("9.9.9");
  });

  test("wipes existing releaseDir on re-run (idempotent)", async () => {
    mkdirSync(releaseDir, { recursive: true });
    writeFileSync(path.join(releaseDir, "stale.txt"), "x");
    expect(existsSync(path.join(releaseDir, "stale.txt"))).toBe(true);
    await stageAtriumRelease({
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
      await stageAtriumRelease({
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
