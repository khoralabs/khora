/**
 * Helpers for the compiled `khora-server` distribution (tarball / Homebrew).
 * Detects package root next to the executable and wires Litestream / sqlite-vec paths.
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
 * Tarball / brew layout: `<root>/bin/khora-server` + `<root>/lib/vec0.*` + `<root>/bin/litestream`.
 * When the binary lives directly in `<root>/` (dev extract), use that directory.
 */
export function resolvePackageRoot(): string {
  const exeDir = resolveExecutableDir();
  if (path.basename(exeDir) === "bin") {
    return path.dirname(exeDir);
  }
  return exeDir;
}

function vec0Filename(): string {
  if (process.platform === "darwin") return "vec0.dylib";
  if (process.platform === "win32") return "vec0.dll";
  return "vec0.so";
}

/** Absolute path to bundled sqlite-vec loadable, if present. */
export function resolveBundledSqliteVecPath(
  packageRoot = resolvePackageRoot(),
): string | undefined {
  const name = vec0Filename();
  const candidates = [
    path.join(packageRoot, "lib", name),
    path.join(packageRoot, name),
    path.join(resolveExecutableDir(), name),
  ];
  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  return undefined;
}

/** Absolute path to bundled Litestream binary, if present. */
export function resolveBundledLitestreamPath(
  packageRoot = resolvePackageRoot(),
): string | undefined {
  const candidates = [
    path.join(packageRoot, "bin", "litestream"),
    path.join(packageRoot, "bin", "khora-litestream"),
    path.join(packageRoot, "litestream"),
    path.join(packageRoot, "khora-litestream"),
    path.join(resolveExecutableDir(), "litestream"),
    path.join(resolveExecutableDir(), "khora-litestream"),
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

/**
 * Apply env defaults for packaged runs: cell workers off, SQLITE_VEC_PATH, LITESTREAM_BIN_PATH,
 * and system SQLCipher / SQLite lib paths when unset.
 */
export function applyPackagedRuntimeDefaults(): void {
  if (!isKhoraPackaged()) return;

  if (
    process.env.KHORA_COLONNADE_CELL_WORKERS === undefined ||
    process.env.KHORA_COLONNADE_CELL_WORKERS.trim() === ""
  ) {
    process.env.KHORA_COLONNADE_CELL_WORKERS = "0";
  }

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
    (process.env.SQLITE_VEC_PATH === undefined || process.env.SQLITE_VEC_PATH.trim() === "") &&
    (process.env.KHORA_SQLITE_VEC_PATH === undefined ||
      process.env.KHORA_SQLITE_VEC_PATH.trim() === "")
  ) {
    const vec = resolveBundledSqliteVecPath();
    if (vec !== undefined) {
      process.env.SQLITE_VEC_PATH = vec;
    }
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
}

/** Persistence resolution root: cwd for packaged binaries, package dir for monorepo. */
export function resolvePersistenceCwd(): string {
  if (isKhoraPackaged()) return process.cwd();
  return path.resolve(import.meta.dir, "..");
}
