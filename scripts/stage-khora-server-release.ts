#!/usr/bin/env bun
/**
 * Stage per-platform khora-server release directories under `apps/release/server-<slug>/`.
 *
 * Inputs:
 *   apps/server/dist/<bun-target>/khora-server
 *   apps/server/.bin/litestream (host arch; cross-downloaded for other targets)
 *   sqlite-vec platform package vec0.*
 *
 * Layout:
 *   bin/khora-server
 *   bin/litestream
 *   lib/vec0.{dylib,so}
 *   README.md
 */
import { chmodSync, cpSync, existsSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import path from "node:path";
import { ensureLitestreamForTarget } from "./ensure-litestream-for-target";
import { type PlatformTarget, SUPPORTED_TARGETS } from "./stage-khora-release";

export type StageServerOptions = {
  workspaceRoot: string;
  releaseDir: string;
  version: string;
  copyBinaries?: boolean;
};

function vec0Name(os: string): string {
  return os === "darwin" ? "vec0.dylib" : "vec0.so";
}

function sqliteVecPackageName(target: PlatformTarget): string {
  return `sqlite-vec-${target.os}-${target.cpu === "x64" ? "x64" : "arm64"}`;
}

/** Resolve vec0 loadable from bun's node_modules layout (optional deps of sqlite-vec). */
export function resolveSqliteVecLoadable(
  workspaceRoot: string,
  target: PlatformTarget,
): string | undefined {
  const pkg = sqliteVecPackageName(target);
  const name = vec0Name(target.os);
  const bunRoot = path.join(workspaceRoot, "node_modules", ".bun");
  if (!existsSync(bunRoot)) return undefined;

  // Prefer exact version folder if present; otherwise scan.
  const candidates: string[] = [];
  try {
    const entries = readdirSync(bunRoot);
    for (const entry of entries) {
      if (!entry.startsWith(`${pkg}@`)) continue;
      candidates.push(path.join(bunRoot, entry, "node_modules", pkg, name));
    }
  } catch {
    /* ignore */
  }

  // Also try resolved package via import.meta when host matches target.
  if (process.platform === target.os && process.arch === target.cpu) {
    try {
      const resolved = Bun.resolveSync(`${pkg}/${name}`, workspaceRoot);
      candidates.unshift(resolved);
    } catch {
      /* ignore */
    }
  }

  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  return undefined;
}

const SQLITE_VEC_VERSION = "0.1.9";

/** Copy host-local vec0 or download the platform package from npm. */
export async function ensureSqliteVecLoadable(
  workspaceRoot: string,
  target: PlatformTarget,
  destPath: string,
): Promise<void> {
  mkdirSync(path.dirname(destPath), { recursive: true });
  const local = resolveSqliteVecLoadable(workspaceRoot, target);
  if (local !== undefined) {
    cpSync(local, destPath);
    return;
  }

  const pkg = sqliteVecPackageName(target);
  const name = vec0Name(target.os);
  const url = `https://registry.npmjs.org/${pkg}/-/${pkg}-${SQLITE_VEC_VERSION}.tgz`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`sqlite-vec download failed for ${target.slug}: ${res.status} ${url}`);
  }
  const tmpDir = path.join(workspaceRoot, "apps/release", `.sqlite-vec-${target.slug}`);
  mkdirSync(tmpDir, { recursive: true });
  try {
    const tarPath = path.join(tmpDir, "pkg.tgz");
    await Bun.write(tarPath, await res.arrayBuffer());
    await Bun.$`tar -xzf ${tarPath} -C ${tmpDir}`.quiet();
    const extracted = path.join(tmpDir, "package", name);
    if (!existsSync(extracted)) {
      throw new Error(`sqlite-vec tarball missing ${name} for ${pkg}`);
    }
    cpSync(extracted, destPath);
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
}

export function serverPackageReadme(version: string): string {
  return `# khora-server ${version}

Headless Khora host (HTTP + WebSocket). Operator APIs use Bearer root token at \`/v1/ops\` and \`/v1/host/registry\`.

## Layout

\`\`\`
bin/khora-server   # compiled server (Litestream opt-in via env)
bin/litestream     # bundled Litestream
lib/vec0.*         # sqlite-vec loadable for Memories
README.md
\`\`\`

## Quick start

\`\`\`bash
# macOS
brew install sqlcipher sqlite

# Debian/Ubuntu
# sudo apt-get install -y libsqlcipher1 libsqlite3-0

export KHORA_SQLCIPHER_KEY='your-key-at-least-16-chars'
export KHORA_OUTBOX_ENCRYPTION_KEY='0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'
export KHORA_DATA_DIR=./data

./bin/khora-server
# listens on :8788 by default
\`\`\`

The binary probes common SQLCipher / libsqlite3 paths and sets \`SQLCIPHER_CUSTOM_LIB\` /
\`SQLITE_CUSTOM_LIB\` when unset. Override those env vars if needed.

Cell Bun Workers default **off** in this package (\`KHORA_COLONNADE_CELL_WORKERS=0\`).

## Litestream (optional)

\`\`\`bash
export KHORA_LITESTREAM=1
export LITESTREAM_S3_BUCKET=...
export LITESTREAM_S3_KEY_PREFIX=hosts/my-host/litestream
# see apps/server/.env.example for MinIO / AWS details
./bin/khora-server
\`\`\`

## See also

- DISTRIBUTION.md in the khora-server app source
- DOCKER.md for the batteries-included container image
`;
}

export async function stageKhoraServerRelease(opts: StageServerOptions): Promise<{
  releaseDir: string;
  packages: string[];
}> {
  const { workspaceRoot, releaseDir, version } = opts;
  const copyBinaries = opts.copyBinaries ?? true;
  const packages: string[] = [];

  for (const target of SUPPORTED_TARGETS) {
    const pkgDir = path.join(releaseDir, `server-${target.slug}`);
    if (existsSync(pkgDir)) rmSync(pkgDir, { recursive: true, force: true });
    mkdirSync(path.join(pkgDir, "bin"), { recursive: true });
    mkdirSync(path.join(pkgDir, "lib"), { recursive: true });

    if (copyBinaries) {
      const src = path.join(workspaceRoot, "apps/server/dist", target.bunTarget, "khora-server");
      if (!existsSync(src)) {
        throw new Error(`missing compiled binary: ${src}`);
      }
      cpSync(src, path.join(pkgDir, "bin", "khora-server"));
      chmodSync(path.join(pkgDir, "bin", "khora-server"), 0o755);

      await ensureLitestreamForTarget(
        workspaceRoot,
        target,
        path.join(pkgDir, "bin", "litestream"),
      );

      await ensureSqliteVecLoadable(
        workspaceRoot,
        target,
        path.join(pkgDir, "lib", vec0Name(target.os)),
      );
    }

    await Bun.write(path.join(pkgDir, "README.md"), serverPackageReadme(version));
    packages.push(pkgDir);
  }

  return { releaseDir, packages };
}

if (import.meta.main) {
  const version = process.argv[2];
  if (!version || !/^\d+\.\d+\.\d+(?:-[\w.-]+)?$/.test(version)) {
    console.error("usage: stage-khora-server-release.ts <semver>");
    process.exit(1);
  }
  const workspaceRoot = path.resolve(import.meta.dir, "..");
  const releaseDir = path.join(workspaceRoot, "apps/release");
  mkdirSync(releaseDir, { recursive: true });
  const result = await stageKhoraServerRelease({ workspaceRoot, releaseDir, version });
  console.log(
    `staged ${result.packages.length} khora-server packages under ${path.relative(process.cwd(), result.releaseDir)}`,
  );
}
