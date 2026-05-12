#!/usr/bin/env bun
/**
 * Stage the 8 npm packages that ship as one atrium release.
 *
 * Inputs (in `workspaceRoot`):
 *   apps/atrium/cli/dist/<bun-target>/atrium                  (cross-compiled bin)
 *   apps/atrium/daemon/dist/<bun-target>/atrium-daemon        (cross-compiled bin)
 *   apps/atrium/cli/assets/configs/{base,cli,daemon}.config.json
 *   apps/atrium/client/atrium-config.schema.json              (built via build:schema)
 *   apps/atrium/cli/scripts/postinstall.ts                    (bundled to JS here)
 *
 * Output tree: `<releaseDir>/{cli,daemon,cli-<slug>,daemon-<slug>}/...`
 * Publish order: all 6 platform pkgs first → daemon meta → cli meta.
 */
import { existsSync, mkdirSync, rmSync } from "node:fs";
import path from "node:path";

export const SUPPORTED_TARGETS = [
  { slug: "darwin-arm64", bunTarget: "bun-darwin-arm64", os: "darwin", cpu: "arm64" },
  { slug: "linux-x64", bunTarget: "bun-linux-x64", os: "linux", cpu: "x64" },
  { slug: "linux-arm64", bunTarget: "bun-linux-arm64", os: "linux", cpu: "arm64" },
] as const;

export type PlatformTarget = (typeof SUPPORTED_TARGETS)[number];

export const SUPPORTED_SLUGS: ReadonlySet<string> = new Set(SUPPORTED_TARGETS.map((t) => t.slug));

/** Inline node-shim launcher for the cli meta-package's `bin`. */
export function cliLauncherSource(): string {
  const slugList = JSON.stringify(Array.from(SUPPORTED_SLUGS).sort());
  return `#!/usr/bin/env node
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const supported = new Set(${slugList});
const slug = \`\${process.platform}-\${process.arch}\`;
if (!supported.has(slug)) {
  console.error(\`atrium: no prebuilt binary for \${slug}; supported: \${[...supported].join(", ")}\`);
  process.exit(1);
}
const cliBin = require.resolve(\`@khoralabs/atrium-cli-\${slug}/atrium\`);
const daemonBin = require.resolve(\`@khoralabs/atrium-daemon-\${slug}/atrium-daemon\`);
const assetsDir = path.resolve(__dirname, "..");
const env = {
  ...process.env,
  ATRIUM_DAEMON_BIN: daemonBin,
  ATRIUM_CLI_ASSETS_DIR: assetsDir,
};
const r = spawnSync(cliBin, process.argv.slice(2), { stdio: "inherit", env });
process.exit(r.status ?? 1);
`;
}

/** Inline node-shim launcher for the daemon meta-package's `bin`. */
export function daemonLauncherSource(): string {
  const slugList = JSON.stringify(Array.from(SUPPORTED_SLUGS).sort());
  return `#!/usr/bin/env node
const { spawnSync } = require("node:child_process");
const supported = new Set(${slugList});
const slug = \`\${process.platform}-\${process.arch}\`;
if (!supported.has(slug)) {
  console.error(\`atrium-daemon: no prebuilt binary for \${slug}; supported: \${[...supported].join(", ")}\`);
  process.exit(1);
}
const bin = require.resolve(\`@khoralabs/atrium-daemon-\${slug}/atrium-daemon\`);
const r = spawnSync(bin, process.argv.slice(2), { stdio: "inherit" });
process.exit(r.status ?? 1);
`;
}

export type MetaPkgJsonInput = {
  version: string;
  repoUrl?: string;
};

const REPO_URL_DEFAULT = "git+https://github.com/khoralabs/agent-kernel.git";

export function cliMetaPkgJson({ version, repoUrl = REPO_URL_DEFAULT }: MetaPkgJsonInput): Record<string, unknown> {
  const optionalDependencies: Record<string, string> = {};
  for (const t of SUPPORTED_TARGETS) optionalDependencies[`@khoralabs/atrium-cli-${t.slug}`] = version;
  return {
    name: "@khoralabs/atrium-cli",
    version,
    description:
      "CLI for the Atrium agent host. Signs requests with a local Ed25519 identity, manages plugins, and supervises the inbox daemon. Native binaries; no runtime required.",
    license: "MIT",
    author: "Khora Labs",
    homepage: "https://github.com/khoralabs/agent-kernel/tree/main/apps/atrium/cli",
    repository: { type: "git", url: repoUrl, directory: "apps/atrium/cli" },
    keywords: ["atrium", "agent", "cli", "khoralabs"],
    type: "module",
    bin: { atrium: "./bin/atrium.js" },
    files: [
      "bin/**",
      "configs/**",
      "postinstall.js",
      "atrium-config.schema.json",
      "README.md",
      "LICENSE",
    ],
    scripts: { postinstall: "node ./postinstall.js" },
    dependencies: { "@khoralabs/atrium-daemon": version },
    optionalDependencies,
  };
}

export function daemonMetaPkgJson({ version, repoUrl = REPO_URL_DEFAULT }: MetaPkgJsonInput): Record<string, unknown> {
  const optionalDependencies: Record<string, string> = {};
  for (const t of SUPPORTED_TARGETS) optionalDependencies[`@khoralabs/atrium-daemon-${t.slug}`] = version;
  return {
    name: "@khoralabs/atrium-daemon",
    version,
    description:
      "Long-lived inbox WebSocket listener for Atrium agents. Native binaries; no runtime required.",
    license: "MIT",
    author: "Khora Labs",
    homepage: "https://github.com/khoralabs/agent-kernel/tree/main/apps/atrium/daemon",
    repository: { type: "git", url: repoUrl, directory: "apps/atrium/daemon" },
    keywords: ["atrium", "agent", "daemon", "khoralabs"],
    type: "module",
    bin: { "atrium-daemon": "./bin/atrium-daemon.js" },
    files: ["bin/**", "README.md", "LICENSE"],
    optionalDependencies,
  };
}

export type PlatformPkgJsonInput = {
  kind: "cli" | "daemon";
  target: PlatformTarget;
  version: string;
  repoUrl?: string;
};

export function platformPkgJson({
  kind,
  target,
  version,
  repoUrl = REPO_URL_DEFAULT,
}: PlatformPkgJsonInput): Record<string, unknown> {
  const binName = kind === "cli" ? "atrium" : "atrium-daemon";
  return {
    name: `@khoralabs/atrium-${kind}-${target.slug}`,
    version,
    description: `Atrium ${kind} native binary for ${target.os}-${target.cpu}.`,
    license: "MIT",
    author: "Khora Labs",
    repository: { type: "git", url: repoUrl, directory: `apps/atrium/${kind}` },
    os: [target.os],
    cpu: [target.cpu],
    files: [binName],
  };
}

async function writeJson(file: string, value: unknown): Promise<void> {
  await Bun.write(file, `${JSON.stringify(value, null, 2)}\n`);
}

export type StageOptions = {
  workspaceRoot: string;
  releaseDir: string;
  version: string;
  /**
   * When false, the staging script does not attempt to copy cross-compiled
   * binaries (used by unit tests that don't run `bun build --compile`).
   */
  copyBinaries?: boolean;
};

export type StageResult = {
  releaseDir: string;
  packages: string[];
};

/** Stage all 8 release packages into `releaseDir`. Idempotent — wipes `releaseDir` first. */
export async function stageAtriumRelease(opts: StageOptions): Promise<StageResult> {
  const { workspaceRoot, releaseDir, version } = opts;
  const copyBinaries = opts.copyBinaries ?? true;

  if (existsSync(releaseDir)) rmSync(releaseDir, { recursive: true, force: true });
  mkdirSync(releaseDir, { recursive: true });

  const packages: string[] = [];

  // --- Platform packages (6) ---
  for (const target of SUPPORTED_TARGETS) {
    for (const kind of ["cli", "daemon"] as const) {
      const pkgDir = path.join(releaseDir, `${kind}-${target.slug}`);
      mkdirSync(pkgDir, { recursive: true });
      const binName = kind === "cli" ? "atrium" : "atrium-daemon";
      if (copyBinaries) {
        const src = path.join(
          workspaceRoot,
          "apps/atrium",
          kind,
          "dist",
          target.bunTarget,
          binName,
        );
        if (!existsSync(src)) {
          throw new Error(`missing compiled binary: ${src}`);
        }
        await Bun.write(path.join(pkgDir, binName), Bun.file(src));
        await Bun.$`chmod +x ${path.join(pkgDir, binName)}`.quiet();
      }
      await writeJson(
        path.join(pkgDir, "package.json"),
        platformPkgJson({ kind, target, version }),
      );
      packages.push(pkgDir);
    }
  }

  // --- Daemon meta ---
  const daemonMetaDir = path.join(releaseDir, "daemon");
  mkdirSync(path.join(daemonMetaDir, "bin"), { recursive: true });
  await Bun.write(path.join(daemonMetaDir, "bin", "atrium-daemon.js"), daemonLauncherSource());
  await Bun.$`chmod +x ${path.join(daemonMetaDir, "bin", "atrium-daemon.js")}`.quiet();
  await writeJson(path.join(daemonMetaDir, "package.json"), daemonMetaPkgJson({ version }));
  const daemonReadme = path.join(workspaceRoot, "apps/atrium/daemon/README.md");
  if (existsSync(daemonReadme)) {
    await Bun.write(path.join(daemonMetaDir, "README.md"), Bun.file(daemonReadme));
  }
  packages.push(daemonMetaDir);

  // --- Cli meta ---
  const cliMetaDir = path.join(releaseDir, "cli");
  mkdirSync(path.join(cliMetaDir, "bin"), { recursive: true });
  mkdirSync(path.join(cliMetaDir, "configs"), { recursive: true });
  await Bun.write(path.join(cliMetaDir, "bin", "atrium.js"), cliLauncherSource());
  await Bun.$`chmod +x ${path.join(cliMetaDir, "bin", "atrium.js")}`.quiet();

  // bundle postinstall.ts -> postinstall.js (target=node)
  const postinstallSrc = path.join(workspaceRoot, "apps/atrium/cli/scripts/postinstall.ts");
  const postinstallOut = path.join(cliMetaDir, "postinstall.js");
  const piResult = await Bun.build({
    entrypoints: [postinstallSrc],
    target: "node",
    format: "esm",
    packages: "bundle",
    outdir: cliMetaDir,
    naming: { entry: "postinstall.js" },
    minify: false,
  });
  if (!piResult.success) {
    for (const log of piResult.logs) console.error(log);
    throw new Error("failed to bundle postinstall.ts");
  }
  // Ensure file was emitted at the expected name (Bun.build with naming above does this).
  if (!existsSync(postinstallOut)) {
    throw new Error(`postinstall bundle missing at ${postinstallOut}`);
  }

  // canonical configs
  const configsSrc = path.join(workspaceRoot, "apps/atrium/cli/assets/configs");
  for (const name of ["base.config.json", "cli.config.json", "daemon.config.json"]) {
    await Bun.write(
      path.join(cliMetaDir, "configs", name),
      Bun.file(path.join(configsSrc, name)),
    );
  }

  // json schema (built via build:schema upstream)
  const schemaSrc = path.join(workspaceRoot, "apps/atrium/client/atrium-config.schema.json");
  if (!existsSync(schemaSrc)) {
    throw new Error(`missing atrium-config.schema.json at ${schemaSrc} — run build:schema first`);
  }
  await Bun.write(
    path.join(cliMetaDir, "atrium-config.schema.json"),
    Bun.file(schemaSrc),
  );

  await writeJson(path.join(cliMetaDir, "package.json"), cliMetaPkgJson({ version }));
  const cliReadme = path.join(workspaceRoot, "apps/atrium/cli/README.md");
  if (existsSync(cliReadme)) {
    await Bun.write(path.join(cliMetaDir, "README.md"), Bun.file(cliReadme));
  }
  packages.push(cliMetaDir);

  return { releaseDir, packages };
}

if (import.meta.main) {
  const version = process.argv[2];
  if (!version || !/^\d+\.\d+\.\d+(?:-[\w.-]+)?$/.test(version)) {
    console.error("usage: stage-atrium-release.ts <semver>");
    process.exit(1);
  }
  const workspaceRoot = path.resolve(import.meta.dir, "..");
  const releaseDir = path.join(workspaceRoot, "apps/atrium/release");
  const result = await stageAtriumRelease({ workspaceRoot, releaseDir, version });
  console.log(`staged ${result.packages.length} packages under ${path.relative(process.cwd(), result.releaseDir)}`);
}
