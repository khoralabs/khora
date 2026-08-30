#!/usr/bin/env bun
/**
 * Download the pinned Litestream binary for the host OS/arch.
 *
 *     bun run scripts/litestream/install.ts --output ./.bin/litestream
 *
 * From an app package (preinstall via thin wrapper):
 *
 *     bun run --filter @khoralabs/khora-server preinstall
 *
 * Idempotent: re-running is a no-op when the existing binary reports the same
 * version. Override with `LITESTREAM_BIN_PATH` or `--output <path>` (`--output`
 * is resolved relative to `process.cwd()` when relative).
 *
 * https://github.com/benbjohnson/litestream/releases/latest
 */
import path from "node:path";
import {
  currentLitestreamBinaryVersion,
  detectHostLitestreamTarget,
  downloadLitestreamTo,
  LITESTREAM_VERSION,
} from "./download";

const DEFAULT_BIN_PATH = path.resolve(
  import.meta.dir,
  "..",
  "..",
  "apps",
  "server",
  ".bin",
  "litestream",
);

function parseOutputArg(): string | undefined {
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--output" || argv[i] === "-o") {
      const v = argv[++i];
      if (v === undefined || v.startsWith("-")) {
        throw new Error("install-litestream: missing value after --output");
      }
      return v;
    }
  }
  return undefined;
}

function resolvedBinPath(): string {
  const out = parseOutputArg();
  if (out !== undefined) {
    return path.isAbsolute(out) ? out : path.resolve(process.cwd(), out);
  }
  const env = process.env.LITESTREAM_BIN_PATH?.trim();
  if (env !== undefined && env.length > 0) {
    return path.isAbsolute(env) ? env : path.resolve(process.cwd(), env);
  }
  return DEFAULT_BIN_PATH;
}

async function main(): Promise<void> {
  const binPath = resolvedBinPath();
  const existing = await currentLitestreamBinaryVersion(binPath);
  if (existing?.includes(LITESTREAM_VERSION)) {
    console.log(`install-litestream: ${binPath} already at v${LITESTREAM_VERSION}`);
    return;
  }

  const target = detectHostLitestreamTarget();
  console.log(`install-litestream: GET ${target.os}-${target.arch}`);
  await downloadLitestreamTo(target, binPath);
  console.log(`install-litestream: installed v${LITESTREAM_VERSION} at ${binPath}`);
}

await main();
