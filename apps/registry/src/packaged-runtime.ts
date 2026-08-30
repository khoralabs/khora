/**
 * Helpers for the compiled `khora-registry` distribution (tarball / Homebrew).
 */
import { existsSync } from "node:fs";
import path from "node:path";

/** True when built with `bun build --compile --define process.env.KHORA_PACKAGED="1"`. */
export function isKhoraPackaged(): boolean {
  return process.env.KHORA_PACKAGED === "1" || process.env.KHORA_PACKAGED === "true";
}

/** Directory containing the running executable (compiled) or this source package root. */
export function resolveExecutableDir(): string {
  if (isKhoraPackaged()) {
    return path.dirname(process.execPath);
  }
  return path.resolve(import.meta.dir, "..");
}

/**
 * Package install root for sidecars.
 * Tarball / brew layout: `<root>/bin/khora-registry` + `<root>/bin/litestream`.
 */
export function resolvePackageRoot(): string {
  const exeDir = resolveExecutableDir();
  if (path.basename(exeDir) === "bin") {
    return path.dirname(exeDir);
  }
  return exeDir;
}

/** Absolute path to bundled Litestream binary, if present. */
export function resolveBundledLitestreamPath(
  packageRoot = resolvePackageRoot(),
): string | undefined {
  const candidates = [
    path.join(packageRoot, "bin", "litestream"),
    path.join(packageRoot, "bin", "khora-registry-litestream"),
    path.join(packageRoot, "litestream"),
    path.join(packageRoot, "khora-registry-litestream"),
    path.join(resolveExecutableDir(), "litestream"),
    path.join(resolveExecutableDir(), "khora-registry-litestream"),
  ];
  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  return undefined;
}

function firstExisting(paths: string[]): string | undefined {
  for (const p of paths) {
    if (p.length > 0 && existsSync(p)) return p;
  }
  return undefined;
}

/** Probe common Homebrew / distro locations for SQLCipher and extension-capable SQLite. */
export function resolveSystemSqliteLibs(): {
  sqlcipher?: string;
  sqlite?: string;
} {
  const sqlcipherCandidates: string[] = [];
  const sqliteCandidates: string[] = [];

  if (process.platform === "darwin") {
    sqlcipherCandidates.push(
      "/opt/homebrew/opt/sqlcipher/lib/libsqlcipher.dylib",
      "/usr/local/opt/sqlcipher/lib/libsqlcipher.dylib",
    );
    sqliteCandidates.push(
      "/opt/homebrew/opt/sqlite/lib/libsqlite3.dylib",
      "/usr/local/opt/sqlite/lib/libsqlite3.dylib",
      "/opt/homebrew/opt/sqlite3/lib/libsqlite3.dylib",
      "/usr/local/opt/sqlite3/lib/libsqlite3.dylib",
    );
  }

  if (process.platform === "linux") {
    sqlcipherCandidates.push(
      "/usr/lib/x86_64-linux-gnu/libsqlcipher.so.1",
      "/usr/lib/aarch64-linux-gnu/libsqlcipher.so.1",
      "/usr/lib/libsqlcipher.so.1",
      "/usr/lib64/libsqlcipher.so.1",
    );
    sqliteCandidates.push(
      "/usr/lib/x86_64-linux-gnu/libsqlite3.so.0",
      "/usr/lib/aarch64-linux-gnu/libsqlite3.so.0",
      "/usr/lib/libsqlite3.so.0",
      "/usr/lib64/libsqlite3.so.0",
    );
  }

  return {
    ...(firstExisting(sqlcipherCandidates) !== undefined
      ? { sqlcipher: firstExisting(sqlcipherCandidates) }
      : {}),
    ...(firstExisting(sqliteCandidates) !== undefined
      ? { sqlite: firstExisting(sqliteCandidates) }
      : {}),
  };
}

/** Apply env defaults for packaged runs: LITESTREAM_BIN_PATH and system SQLCipher / SQLite lib paths. */
export function applyPackagedRuntimeDefaults(): void {
  if (!isKhoraPackaged()) return;

  const libs = resolveSystemSqliteLibs();
  if (
    (process.env.SQLCIPHER_CUSTOM_LIB === undefined ||
      process.env.SQLCIPHER_CUSTOM_LIB.trim() === "") &&
    libs.sqlcipher !== undefined
  ) {
    process.env.SQLCIPHER_CUSTOM_LIB = libs.sqlcipher;
  }
  if (
    (process.env.SQLITE_CUSTOM_LIB === undefined || process.env.SQLITE_CUSTOM_LIB.trim() === "") &&
    libs.sqlite !== undefined
  ) {
    process.env.SQLITE_CUSTOM_LIB = libs.sqlite;
  }

  if (
    process.env.LITESTREAM_BIN_PATH === undefined ||
    process.env.LITESTREAM_BIN_PATH.trim() === ""
  ) {
    const ls = resolveBundledLitestreamPath();
    if (ls !== undefined) {
      process.env.LITESTREAM_BIN_PATH = ls;
    }
  }

  if (
    process.env.REGISTRY_DATABASE_PATH === undefined ||
    process.env.REGISTRY_DATABASE_PATH.trim() === ""
  ) {
    process.env.REGISTRY_DATABASE_PATH = "./data/registry.sqlite";
  }
}

/** Persistence resolution root: cwd for packaged binaries, package dir for monorepo. */
export function resolvePersistenceCwd(): string {
  if (isKhoraPackaged()) return process.cwd();
  return path.resolve(import.meta.dir, "..");
}
