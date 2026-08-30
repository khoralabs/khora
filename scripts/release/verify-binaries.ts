#!/usr/bin/env bun
/**
 * Smoke-test compiled release binaries before publish.
 *
 *   bun run scripts/release/verify-binaries.ts cli
 *   bun run scripts/release/verify-binaries.ts server
 *   bun run scripts/release/verify-binaries.ts registry
 */
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { SUPPORTED_TARGETS } from "./targets";

const workspaceRoot = path.resolve(import.meta.dir, "../..");
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

function runCliOrDaemon(label: string, binPath: string): void {
  if (!existsSync(binPath)) {
    throw new Error(`missing binary: ${binPath}`);
  }
  const proc = Bun.spawnSync([binPath], {
    stdout: "pipe",
    stderr: "pipe",
    timeout: 5000,
  });
  const stdout = new TextDecoder().decode(proc.stdout);
  const stderr = new TextDecoder().decode(proc.stderr);
  const combined = `${stdout}\n${stderr}`;
  assertNoNativeBindingCrash(label, combined);
  if (label.startsWith("cli ") && (proc.exitCode !== 1 || !combined.includes("khora"))) {
    throw new Error(
      `${label} failed (exit ${proc.exitCode ?? "null"})\nstdout:\n${stdout}\nstderr:\n${stderr}`,
    );
  }
  if (label.startsWith("daemon ") && !combined.includes("khora-daemon")) {
    throw new Error(
      `${label} failed (exit ${proc.exitCode ?? "null"})\nstdout:\n${stdout}\nstderr:\n${stderr}`,
    );
  }
}

async function smokeServer(label: string, binPath: string, packageRoot?: string): Promise<void> {
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
    combined += await new Response(stream).text();
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

async function smokeRegistry(label: string, binPath: string, packageRoot?: string): Promise<void> {
  if (!existsSync(binPath)) {
    throw new Error(`missing binary: ${binPath}`);
  }

  const dataDir = mkdtempSync(path.join(tmpdir(), "khora-registry-smoke-"));
  const port = 14000 + Math.floor(Math.random() * 1000);
  const env: Record<string, string> = {
    ...process.env,
    PORT: String(port),
    REGISTRY_DATABASE_PATH: path.join(dataDir, "registry.sqlite"),
    REGISTRY_SQLCIPHER_KEY: "smoke-test-sqlcipher-key!!",
    BETTER_AUTH_SECRET: "0123456789abcdef0123456789abcdef",
    REGISTRY_AUTH_OTP_LOG: "1",
    LOG_LEVEL: "error",
  };

  if (packageRoot !== undefined) {
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
    combined += await new Response(stream).text();
  };
  void collect(proc.stdout);
  void collect(proc.stderr);

  try {
    let ok = false;
    for (let i = 0; i < 40; i++) {
      await Bun.sleep(250);
      try {
        const res = await fetch(`http://127.0.0.1:${port}/health`);
        if (res.ok) {
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

async function verifyCli(): Promise<void> {
  for (const target of SUPPORTED_TARGETS) {
    const cliPath = path.join(workspaceRoot, "apps/cli/dist", target.bunTarget, "khora");
    const daemonPath = path.join(
      workspaceRoot,
      "apps/daemon/dist",
      target.bunTarget,
      "khora-daemon",
    );
    const cliLabel = `cli ${target.slug}`;
    const daemonLabel = `daemon ${target.slug}`;

    if (target.slug === hostSlug) {
      runCliOrDaemon(cliLabel, cliPath);
      runCliOrDaemon(daemonLabel, daemonPath);
    } else {
      scanBinary(cliLabel, cliPath);
      scanBinary(daemonLabel, daemonPath);
    }
  }
  console.log(`verified ${SUPPORTED_TARGETS.length * 2} khora release binaries`);
}

async function verifyServer(): Promise<void> {
  for (const target of SUPPORTED_TARGETS) {
    const distBin = path.join(workspaceRoot, "apps/server/dist", target.bunTarget, "khora-server");
    const stagedRoot = path.join(workspaceRoot, "apps/release", `server-${target.slug}`);
    const stagedBin = path.join(stagedRoot, "bin", "khora-server");
    const label = `server ${target.slug}`;

    const binPath = existsSync(stagedBin) ? stagedBin : distBin;
    const packageRoot = existsSync(stagedBin) ? stagedRoot : undefined;

    if (target.slug === hostSlug) {
      await smokeServer(label, binPath, packageRoot);
    } else if (existsSync(binPath)) {
      scanBinary(label, binPath);
    } else {
      throw new Error(`missing binary for ${label}: tried ${stagedBin} and ${distBin}`);
    }
  }
  console.log(`verified ${SUPPORTED_TARGETS.length} khora-server release binaries`);
}

async function verifyRegistry(): Promise<void> {
  for (const target of SUPPORTED_TARGETS) {
    const distBin = path.join(
      workspaceRoot,
      "apps/registry/dist",
      target.bunTarget,
      "khora-registry",
    );
    const stagedRoot = path.join(workspaceRoot, "apps/release", `registry-${target.slug}`);
    const stagedBin = path.join(stagedRoot, "bin", "khora-registry");
    const label = `registry ${target.slug}`;

    const binPath = existsSync(stagedBin) ? stagedBin : distBin;
    const packageRoot = existsSync(stagedBin) ? stagedRoot : undefined;

    if (target.slug === hostSlug) {
      await smokeRegistry(label, binPath, packageRoot);
    } else if (existsSync(binPath)) {
      scanBinary(label, binPath);
    } else {
      throw new Error(`missing binary for ${label}: tried ${stagedBin} and ${distBin}`);
    }
  }
  console.log(`verified ${SUPPORTED_TARGETS.length} khora-registry release binaries`);
}

const product = process.argv[2];
if (product !== "cli" && product !== "server" && product !== "registry") {
  console.error("usage: scripts/release/verify-binaries.ts <cli|server|registry>");
  process.exit(1);
}
if (product === "cli") await verifyCli();
else if (product === "server") await verifyServer();
else await verifyRegistry();
