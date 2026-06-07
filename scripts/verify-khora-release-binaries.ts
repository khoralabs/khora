#!/usr/bin/env bun
/**
 * Smoke-test compiled khora CLI/daemon binaries before npm publish.
 * Fails fast if a binary crashes on startup (e.g. eager native-binding loads).
 */
import { existsSync, readFileSync } from "node:fs";
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

function runBinary(label: string, binPath: string): void {
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

for (const target of SUPPORTED_TARGETS) {
  const cliPath = path.join(workspaceRoot, "apps/khora/cli/dist", target.bunTarget, "khora");
  const daemonPath = path.join(
    workspaceRoot,
    "apps/khora/daemon/dist",
    target.bunTarget,
    "khora-daemon",
  );
  const cliLabel = `cli ${target.slug}`;
  const daemonLabel = `daemon ${target.slug}`;

  if (target.slug === hostSlug) {
    runBinary(cliLabel, cliPath);
    runBinary(daemonLabel, daemonPath);
  } else {
    scanBinary(cliLabel, cliPath);
    scanBinary(daemonLabel, daemonPath);
  }
}

console.log(`verified ${SUPPORTED_TARGETS.length * 2} khora release binaries`);
