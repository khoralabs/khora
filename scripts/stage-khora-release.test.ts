import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  cliLauncherSource,
  cliMetaPkgJson,
  daemonLauncherSource,
  normalizeRegistryUrl,
  platformPkgJson,
  SUPPORTED_TARGETS,
  stageKhoraRelease,
  withRegistryUrl,
} from "./stage-khora-release";

describe("launcher sources", () => {
  test("cli launcher sets KHORA_DAEMON_BIN + KHORA_CLI_ASSETS_DIR", () => {
    const src = cliLauncherSource();
    expect(src).toContain("KHORA_DAEMON_BIN");
    expect(src).toContain("KHORA_CLI_ASSETS_DIR");
    expect(src).toContain("@khoralabs/khora-daemon-");
  });

  test("daemon launcher resolves platform daemon binary", () => {
    const src = daemonLauncherSource();
    expect(src).toContain("@khoralabs/khora-daemon-");
    expect(src.includes("KHORA_DAEMON_BIN")).toBe(false);
  });
});

describe("package.json factories", () => {
  test("cli meta lists daemon dependency + platform optionalDependencies", () => {
    const pkg = cliMetaPkgJson({ version: "1.2.3" }) as Record<string, unknown> & {
      dependencies?: Record<string, string>;
      optionalDependencies?: Record<string, string>;
      scripts?: Record<string, string>;
    };
    expect(pkg.dependencies?.["@khoralabs/khora-daemon"]).toBe("1.2.3");
    expect(Object.keys(pkg.optionalDependencies ?? {}).length).toBe(3);
    expect(pkg.scripts?.postinstall).toBeUndefined();
  });

  test("platform pkg.json for cli and daemon binaries", () => {
    const t = SUPPORTED_TARGETS[0];
    const cliPkg = platformPkgJson({ kind: "cli", target: t, version: "1.2.3" }) as Record<
      string,
      unknown
    >;
    expect(cliPkg.name).toBe(`@khoralabs/khora-cli-${t.slug}`);
    expect(cliPkg.files).toEqual(["khora"]);
    const daemonPkg = platformPkgJson({
      kind: "daemon",
      target: t,
      version: "1.2.3",
    }) as Record<string, unknown>;
    expect(daemonPkg.name).toBe(`@khoralabs/khora-daemon-${t.slug}`);
    expect(daemonPkg.files).toEqual(["khora-daemon"]);
  });
});

describe("registry URL staging", () => {
  test("normalizeRegistryUrl strips trailing slash", () => {
    expect(normalizeRegistryUrl("https://r.khoralabs.com/")).toBe("https://r.khoralabs.com");
  });

  test("withRegistryUrl overrides base config", () => {
    expect(
      withRegistryUrl({ baseUrl: "http://127.0.0.1:8787" }, "https://registry.example.com/"),
    ).toEqual({
      baseUrl: "http://127.0.0.1:8787",
      registryUrl: "https://registry.example.com",
    });
  });
});

describe("stageKhoraRelease", () => {
  let workspace: string;
  let releaseDir: string;

  beforeEach(() => {
    workspace = mkdtempSync(path.join(tmpdir(), "khora-stage-"));
    releaseDir = path.join(workspace, "apps/release");

    mkdirSync(path.join(workspace, "apps/cli/assets/configs"), { recursive: true });
    mkdirSync(path.join(workspace, "packages/khora/client"), { recursive: true });

    for (const name of ["base.config.json", "cli.config.json", "daemon.config.json"]) {
      writeFileSync(
        path.join(workspace, "apps/cli/assets/configs", name),
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

  test("produces 8 package directories", async () => {
    const result = await stageKhoraRelease({
      workspaceRoot: workspace,
      releaseDir,
      version: "9.9.9",
      copyBinaries: false,
    });
    expect(result.packages.length).toBe(8);
    expect(existsSync(path.join(releaseDir, "daemon", "bin", "khora-daemon.cjs"))).toBe(true);
  });

  test("writes registryUrl into staged base.config.json", async () => {
    writeFileSync(
      path.join(workspace, "apps/cli/assets/configs/base.config.json"),
      JSON.stringify({ baseUrl: "http://127.0.0.1:8787" }),
    );
    await stageKhoraRelease({
      workspaceRoot: workspace,
      releaseDir,
      version: "9.9.9",
      registryUrl: "https://registry.example.com/",
      copyBinaries: false,
    });
    const staged = JSON.parse(
      await Bun.file(path.join(releaseDir, "cli/configs/base.config.json")).text(),
    ) as { registryUrl?: string };
    expect(staged.registryUrl).toBe("https://registry.example.com");
  });
});
