#!/usr/bin/env bun
/**
 * Stage the 4 npm packages that ship as one khora-cli release.
 *
 * Inputs (in `workspaceRoot`):
 *   apps/khora/cli/dist/<bun-target>/khora                  (cross-compiled bin)
 *   apps/khora/cli/assets/configs/{base,cli,daemon}.config.json
 *   packages/khora/client/khora-config.schema.json          (built via build:schema)
 *   apps/khora/cli/scripts/postinstall.entry.ts             (bundled to JS here)
 *
 * Output tree: `<releaseDir>/{cli,cli-<slug>}/...`
 * Publish order: all 3 platform pkgs first → cli meta.
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
const assetsDir = path.resolve(__dirname, "..");
let metaVersion = "";
try { metaVersion = String(require(path.resolve(assetsDir, "package.json")).version || ""); } catch (_) {}
const env = {
  ...process.env,
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
    files: [
      "bin/**",
      "configs/**",
      "postinstall.js",
      "khora-config.schema.json",
      "README.md",
      "LICENSE",
    ],
    scripts: { postinstall: "node ./postinstall.js" },
    optionalDependencies,
  };
}

export type PlatformPkgJsonInput = {
  target: PlatformTarget;
  version: string;
  repoUrl?: string;
};

export function platformPkgJson({
  target,
  version,
  repoUrl = REPO_URL_DEFAULT,
}: PlatformPkgJsonInput): Record<string, unknown> {
  return {
    name: `@khoralabs/khora-cli-${target.slug}`,
    version,
    description: `Khora CLI native binary for ${target.os}-${target.cpu}.`,
    license: "MIT",
    author: "Khora Labs",
    repository: { type: "git", url: repoUrl, directory: "apps/khora/cli" },
    os: [target.os],
    cpu: [target.cpu],
    files: ["khora"],
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

/** Stage all 4 release packages into `releaseDir`. Idempotent — wipes `releaseDir` first. */
export async function stageKhoraRelease(opts: StageOptions): Promise<StageResult> {
  const { workspaceRoot, releaseDir, version } = opts;
  const copyBinaries = opts.copyBinaries ?? true;

  if (existsSync(releaseDir)) rmSync(releaseDir, { recursive: true, force: true });
  mkdirSync(releaseDir, { recursive: true });

  const packages: string[] = [];

  // --- Platform packages (3) ---
  for (const target of SUPPORTED_TARGETS) {
    const pkgDir = path.join(releaseDir, `cli-${target.slug}`);
    mkdirSync(pkgDir, { recursive: true });
    const binName = "khora";
    if (copyBinaries) {
      const src = path.join(
        workspaceRoot,
        "apps/khora/cli/dist",
        target.bunTarget,
        binName,
      );
      if (!existsSync(src)) {
        throw new Error(`missing compiled binary: ${src}`);
      }
      await Bun.write(path.join(pkgDir, binName), Bun.file(src));
      await Bun.$`chmod +x ${path.join(pkgDir, binName)}`.quiet();
    }
    await writeJson(path.join(pkgDir, "package.json"), platformPkgJson({ target, version }));
    packages.push(pkgDir);
  }

  // --- Cli meta ---
  const cliMetaDir = path.join(releaseDir, "cli");
  mkdirSync(path.join(cliMetaDir, "bin"), { recursive: true });
  mkdirSync(path.join(cliMetaDir, "configs"), { recursive: true });
  await Bun.write(path.join(cliMetaDir, "bin", "khora.cjs"), cliLauncherSource());
  await Bun.$`chmod +x ${path.join(cliMetaDir, "bin", "khora.cjs")}`.quiet();

  // bundle postinstall.entry.ts -> postinstall.js (target=node)
  const postinstallSrc = path.join(workspaceRoot, "apps/khora/cli/scripts/postinstall.entry.ts");
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
    throw new Error("failed to bundle postinstall.entry.ts");
  }
  // Ensure file was emitted at the expected name (Bun.build with naming above does this).
  if (!existsSync(postinstallOut)) {
    throw new Error(`postinstall bundle missing at ${postinstallOut}`);
  }

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
    `staged ${result.packages.length} khora-cli packages under ${path.relative(process.cwd(), result.releaseDir)}`,
  );
}
