#!/usr/bin/env bun
/**
 * Stage per-platform khora-registry release directories under `apps/release/registry-<slug>/`.
 *
 * Layout:
 *   bin/khora-registry
 *   bin/litestream
 *   README.md
 */
import { chmodSync, cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { ensureLitestreamForTarget } from "./ensure-litestream-for-target";
import { SUPPORTED_TARGETS } from "./stage-khora-release";

export type StageRegistryOptions = {
  workspaceRoot: string;
  releaseDir: string;
  version: string;
  copyBinaries?: boolean;
};

export function registryPackageReadme(version: string): string {
  return `# khora-registry ${version}

Khora skill registry (HTTP API + auth). Operator APIs use Bearer token at \`/v1/ops\` when \`REGISTRY_CONSOLE_ROOT_TOKEN\` is set.

## Layout

\`\`\`
bin/khora-registry   # compiled server (Litestream opt-in via env)
bin/litestream       # bundled Litestream
README.md
\`\`\`

## Quick start

\`\`\`bash
# macOS
brew install sqlcipher sqlite

# Debian/Ubuntu
# sudo apt-get install -y libsqlcipher1 libsqlite3-0

export REGISTRY_SQLCIPHER_KEY='your-key-at-least-16-chars'
export BETTER_AUTH_SECRET='0123456789abcdef0123456789abcdef'
export REGISTRY_AUTH_OTP_LOG=1
export REGISTRY_DATABASE_PATH=./data/registry.sqlite

./bin/khora-registry
# listens on :4000 by default
\`\`\`

The binary probes common SQLCipher / libsqlite3 paths and sets \`SQLCIPHER_CUSTOM_LIB\` /
\`SQLITE_CUSTOM_LIB\` when unset. Override those env vars if needed.

## Litestream (optional)

\`\`\`bash
export REGISTRY_LITESTREAM=1
export LITESTREAM_S3_BUCKET=...
export LITESTREAM_S3_KEY_PREFIX=registry/litestream
# see apps/registry/.env.example for MinIO / AWS details
./bin/khora-registry
\`\`\`
`;
}

export async function stageKhoraRegistryRelease(opts: StageRegistryOptions): Promise<{
  releaseDir: string;
  packages: string[];
}> {
  const { workspaceRoot, releaseDir, version } = opts;
  const copyBinaries = opts.copyBinaries ?? true;
  const packages: string[] = [];

  for (const target of SUPPORTED_TARGETS) {
    const pkgDir = path.join(releaseDir, `registry-${target.slug}`);
    if (existsSync(pkgDir)) rmSync(pkgDir, { recursive: true, force: true });
    mkdirSync(path.join(pkgDir, "bin"), { recursive: true });

    if (copyBinaries) {
      const src = path.join(
        workspaceRoot,
        "apps/registry/dist",
        target.bunTarget,
        "khora-registry",
      );
      if (!existsSync(src)) {
        throw new Error(`missing compiled binary: ${src}`);
      }
      cpSync(src, path.join(pkgDir, "bin", "khora-registry"));
      chmodSync(path.join(pkgDir, "bin", "khora-registry"), 0o755);

      await ensureLitestreamForTarget(
        workspaceRoot,
        target,
        path.join(pkgDir, "bin", "litestream"),
        path.join(workspaceRoot, "apps/registry/.bin/litestream"),
      );
    }

    await Bun.write(path.join(pkgDir, "README.md"), registryPackageReadme(version));
    packages.push(pkgDir);
  }

  return { releaseDir, packages };
}

if (import.meta.main) {
  const version = process.argv[2];
  if (!version || !/^\d+\.\d+\.\d+(?:-[\w.-]+)?$/.test(version)) {
    console.error("usage: stage-khora-registry-release.ts <semver>");
    process.exit(1);
  }
  const workspaceRoot = path.resolve(import.meta.dir, "..");
  const releaseDir = path.join(workspaceRoot, "apps/release");
  mkdirSync(releaseDir, { recursive: true });
  const result = await stageKhoraRegistryRelease({ workspaceRoot, releaseDir, version });
  console.log(
    `staged ${result.packages.length} khora-registry packages under ${path.relative(process.cwd(), result.releaseDir)}`,
  );
}
