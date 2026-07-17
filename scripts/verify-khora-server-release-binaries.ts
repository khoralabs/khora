#!/usr/bin/env bun
/**
 * Smoke-test compiled khora-server binaries (and staged package layout when present).
 */
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { SUPPORTED_TARGETS } from "./stage-khora-release";

const workspaceRoot = path.resolve(import.meta.dir, "..");
const hostSlug = `${process.platform}-${process.arch}`;

function assertNoNativeBindingCrash(label: string, combined: string): void {
  if (combined.includes("Cannot find native binding")) {
    throw new Error(`${label} crashed on native binding load\n${combined}`);
  }
}

function scanBinary(label: string, binPath: string): void {
  const bytes = readFileSync(binPath);
  const text = bytes.toString("utf8", 0, Math.min(bytes.length, 8_000_000));
  if (text.includes("Cannot find native binding")) {
    throw new Error(`${label} embeds native-binding crash path (stale or bad compile)`);
  }
}

async function smokeHostBinary(
  label: string,
  binPath: string,
  packageRoot?: string,
): Promise<void> {
  if (!existsSync(binPath)) {
    throw new Error(`missing binary: ${binPath}`);
  }

  const dataDir = mkdtempSync(path.join(tmpdir(), "khora-server-smoke-"));
  const port = 18788 + Math.floor(Math.random() * 1000);
  const env: Record<string, string> = {
    ...process.env,
    PORT: String(port),
    KHORA_DATA_DIR: dataDir,
    KHORA_SQLCIPHER_KEY: "smoke-test-sqlcipher-key!!",
    KHORA_OUTBOX_ENCRYPTION_KEY: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
    KHORA_COLONNADE_CELL_WORKERS: "0",
    KHORA_MEMORIES: "0",
    LOG_LEVEL: "error",
  };

  if (packageRoot !== undefined) {
    const vec =
      process.platform === "darwin"
        ? path.join(packageRoot, "lib", "vec0.dylib")
        : path.join(packageRoot, "lib", "vec0.so");
    if (existsSync(vec)) env.SQLITE_VEC_PATH = vec;
    const ls = path.join(packageRoot, "bin", "litestream");
    if (existsSync(ls)) env.LITESTREAM_BIN_PATH = ls;
  }

  const proc = Bun.spawn([binPath], {
    cwd: dataDir,
    env,
    stdout: "pipe",
    stderr: "pipe",
  });

  let combined = "";
  const collect = async (stream: ReadableStream<Uint8Array> | null) => {
    if (stream === null) return;
    const text = await new Response(stream).text();
    combined += text;
  };
  void collect(proc.stdout);
  void collect(proc.stderr);

  try {
    let ok = false;
    for (let i = 0; i < 40; i++) {
      await Bun.sleep(250);
      try {
        const res = await fetch(`http://127.0.0.1:${port}/.well-known/khora`);
        if (res.ok || res.status === 404 || res.status === 200) {
          ok = true;
          break;
        }
      } catch {
        /* not up yet */
      }
      if (proc.exitCode !== null) break;
    }

    assertNoNativeBindingCrash(label, combined);
    if (!ok) {
      throw new Error(
        `${label} failed to become ready (exit ${proc.exitCode ?? "running"})\n${combined}`,
      );
    }
  } finally {
    try {
      proc.kill("SIGTERM");
    } catch {
      /* ignore */
    }
    try {
      await proc.exited;
    } catch {
      /* ignore */
    }
    rmSync(dataDir, { recursive: true, force: true });
  }
}

for (const target of SUPPORTED_TARGETS) {
  const distBin = path.join(
    workspaceRoot,
    "apps/khora/server/dist",
    target.bunTarget,
    "khora-server",
  );
  const stagedRoot = path.join(workspaceRoot, "apps/khora/release", `server-${target.slug}`);
  const stagedBin = path.join(stagedRoot, "bin", "khora-server");
  const label = `server ${target.slug}`;

  const binPath = existsSync(stagedBin) ? stagedBin : distBin;
  const packageRoot = existsSync(stagedBin) ? stagedRoot : undefined;

  if (target.slug === hostSlug) {
    await smokeHostBinary(label, binPath, packageRoot);
  } else if (existsSync(binPath)) {
    scanBinary(label, binPath);
  } else {
    throw new Error(`missing binary for ${label}: tried ${stagedBin} and ${distBin}`);
  }
}

console.log(`verified ${SUPPORTED_TARGETS.length} khora-server release binaries`);
