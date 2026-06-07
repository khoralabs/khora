#!/usr/bin/env bun
/**
 * Stage the 8 npm packages that ship as one khora release.
 *
 * Inputs (in `workspaceRoot`):
 *   apps/khora/cli/dist/<bun-target>/khora
 *   apps/khora/daemon/dist/<bun-target>/khora-daemon
 *   apps/khora/cli/assets/configs/{base,cli,daemon}.config.json
 *   packages/khora/client/khora-config.schema.json
 *
 * Output tree: `<releaseDir>/{cli,daemon,cli-<slug>,daemon-<slug>}/...`
 * Publish order: all 6 platform pkgs → daemon meta → cli meta.
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
  console.error(\`khora: no prebuilt binary for \${slug}; supported: \${[...supported].join(", ")}\`);
  process.exit(1);
}
const cliBin = require.resolve(\`@khoralabs/khora-cli-\${slug}/khora\`);
const daemonBin = require.resolve(\`@khoralabs/khora-daemon-\${slug}/khora-daemon\`);
const assetsDir = path.resolve(__dirname, "..");
let metaVersion = "";
try { metaVersion = String(require(path.resolve(assetsDir, "package.json")).version || ""); } catch (_) {}
const env = {
  ...process.env,
  KHORA_DAEMON_BIN: daemonBin,
  KHORA_CLI_ASSETS_DIR: assetsDir,
  KHORA_CLI_VERSION: metaVersion,
};
const r = spawnSync(cliBin, process.argv.slice(2), { stdio: "inherit", env });
process.exit(r.status ?? 1);
`;
}

export type MetaPkgJsonInput = {
  version: string;
  repoUrl?: string;
};

const REPO_URL_DEFAULT = "git+https://github.com/khoralabs/agent-kernel.git";

export function cliMetaPkgJson({
  version,
  repoUrl = REPO_URL_DEFAULT,
}: MetaPkgJsonInput): Record<string, unknown> {
  const optionalDependencies: Record<string, string> = {};
  for (const t of SUPPORTED_TARGETS)
    optionalDependencies[`@khoralabs/khora-cli-${t.slug}`] = version;
  return {
    name: "@khoralabs/khora-cli",
    version,
    description:
      "CLI for the Khora agent host. Register, profile, search, posts, and subscriptions. Signs requests with a local Ed25519 identity. Native binaries; no runtime required.",
    license: "MIT",
    author: "Khora Labs",
    homepage: "https://github.com/khoralabs/agent-kernel/tree/main/apps/khora/cli",
    repository: { type: "git", url: repoUrl, directory: "apps/khora/cli" },
    keywords: ["khora", "agent", "cli", "khoralabs"],
    type: "module",
    bin: { khora: "./bin/khora.cjs" },
    files: ["bin/**", "configs/**", "khora-config.schema.json", "README.md", "LICENSE"],
    dependencies: { "@khoralabs/khora-daemon": version },
    optionalDependencies,
    publishConfig: { access: "public" },
  };
}

/** Inline node-shim launcher for the daemon meta-package's `bin`. */
export function daemonLauncherSource(): string {
  const slugList = JSON.stringify(Array.from(SUPPORTED_SLUGS).sort());
  return `#!/usr/bin/env node
const { spawnSync } = require("node:child_process");
const supported = new Set(${slugList});
const slug = \`\${process.platform}-\${process.arch}\`;
if (!supported.has(slug)) {
  console.error(\`khora-daemon: no prebuilt binary for \${slug}; supported: \${[...supported].join(", ")}\`);
  process.exit(1);
}
const bin = require.resolve(\`@khoralabs/khora-daemon-\${slug}/khora-daemon\`);
const r = spawnSync(bin, process.argv.slice(2), { stdio: "inherit" });
process.exit(r.status ?? 1);
`;
}

export function daemonMetaPkgJson({
  version,
  repoUrl = REPO_URL_DEFAULT,
}: MetaPkgJsonInput): Record<string, unknown> {
  const optionalDependencies: Record<string, string> = {};
  for (const t of SUPPORTED_TARGETS)
    optionalDependencies[`@khoralabs/khora-daemon-${t.slug}`] = version;
  return {
    name: "@khoralabs/khora-daemon",
    version,
    description:
      "Long-lived inbox WebSocket listener for Khora agents. Native binaries; no runtime required.",
    license: "MIT",
    author: "Khora Labs",
    homepage: "https://github.com/khoralabs/agent-kernel/tree/main/apps/khora/daemon",
    repository: { type: "git", url: repoUrl, directory: "apps/khora/daemon" },
    keywords: ["khora", "agent", "daemon", "inbox", "khoralabs"],
    type: "module",
    bin: { "khora-daemon": "./bin/khora-daemon.cjs" },
    files: ["bin/**", "README.md", "LICENSE"],
    optionalDependencies,
    publishConfig: { access: "public" },
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
  const binName = kind === "cli" ? "khora" : "khora-daemon";
  return {
    name: `@khoralabs/khora-${kind}-${target.slug}`,
    version,
    description: `Khora ${kind} native binary for ${target.os}-${target.cpu}.`,
    license: "MIT",
    author: "Khora Labs",
    repository: { type: "git", url: repoUrl, directory: `apps/khora/${kind}` },
    os: [target.os],
    cpu: [target.cpu],
    files: [binName],
    publishConfig: { access: "public" },
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
export async function stageKhoraRelease(opts: StageOptions): Promise<StageResult> {
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
      const binName = kind === "cli" ? "khora" : "khora-daemon";
      if (copyBinaries) {
        const src = path.join(workspaceRoot, "apps/khora", kind, "dist", target.bunTarget, binName);
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
  await Bun.write(path.join(daemonMetaDir, "bin", "khora-daemon.cjs"), daemonLauncherSource());
  await Bun.$`chmod +x ${path.join(daemonMetaDir, "bin", "khora-daemon.cjs")}`.quiet();
  await writeJson(path.join(daemonMetaDir, "package.json"), daemonMetaPkgJson({ version }));
  const daemonReadme = path.join(workspaceRoot, "apps/khora/daemon/README.md");
  if (existsSync(daemonReadme)) {
    await Bun.write(path.join(daemonMetaDir, "README.md"), Bun.file(daemonReadme));
  }
  packages.push(daemonMetaDir);

  // --- Cli meta ---
  const cliMetaDir = path.join(releaseDir, "cli");
  mkdirSync(path.join(cliMetaDir, "bin"), { recursive: true });
  mkdirSync(path.join(cliMetaDir, "configs"), { recursive: true });
  await Bun.write(path.join(cliMetaDir, "bin", "khora.cjs"), cliLauncherSource());
  await Bun.$`chmod +x ${path.join(cliMetaDir, "bin", "khora.cjs")}`.quiet();

  // canonical configs
  const configsSrc = path.join(workspaceRoot, "apps/khora/cli/assets/configs");
  for (const name of ["base.config.json", "cli.config.json", "daemon.config.json"]) {
    await Bun.write(path.join(cliMetaDir, "configs", name), Bun.file(path.join(configsSrc, name)));
  }

  // json schema (built via build:schema upstream)
  const schemaSrc = path.join(workspaceRoot, "packages/khora/client/khora-config.schema.json");
  if (!existsSync(schemaSrc)) {
    throw new Error(`missing khora-config.schema.json at ${schemaSrc} — run build:schema first`);
  }
  await Bun.write(path.join(cliMetaDir, "khora-config.schema.json"), Bun.file(schemaSrc));

  await writeJson(path.join(cliMetaDir, "package.json"), cliMetaPkgJson({ version }));
  const cliReadme = path.join(workspaceRoot, "apps/khora/cli/README.md");
  if (existsSync(cliReadme)) {
    await Bun.write(path.join(cliMetaDir, "README.md"), Bun.file(cliReadme));
  }
  packages.push(cliMetaDir);

  return { releaseDir, packages };
}

if (import.meta.main) {
  const version = process.argv[2];
  if (!version || !/^\d+\.\d+\.\d+(?:-[\w.-]+)?$/.test(version)) {
    console.error("usage: stage-khora-release.ts <semver>");
    process.exit(1);
  }
  const workspaceRoot = path.resolve(import.meta.dir, "..");
  const releaseDir = path.join(workspaceRoot, "apps/khora/release");
  const result = await stageKhoraRelease({ workspaceRoot, releaseDir, version });
  console.log(
    `staged ${result.packages.length} khora release packages under ${path.relative(process.cwd(), result.releaseDir)}`,
  );
}
