#!/usr/bin/env bun
/**
 * Download the pinned Litestream binary into `apps/server/.bin/litestream` by default.
 *
 *     bun run ../../scripts/install-litestream.ts
 *     bun run ../../scripts/install-litestream.ts --output ./.bin/litestream
 *
 * From the Khora server package (preinstall):
 *
 *     bun run --filter @khoralabs/khora-server preinstall
 *
 * Idempotent: re-running is a no-op when the existing binary reports the same
 * version. Override with `LITESTREAM_BIN_PATH` or `--output <path>` (`--output`
 * is resolved relative to `process.cwd()` when relative).
 *
 * https://github.com/benbjohnson/litestream/releases/latest
 */
import { chmodSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";

const LITESTREAM_VERSION = "0.5.11";

const DEFAULT_BIN_PATH = path.resolve(
  import.meta.dir,
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

type ReleaseTarget = {
  os: "linux" | "darwin";
  arch: "x86_64" | "arm64";
};

function detectTarget(): ReleaseTarget {
  const os = process.platform;
  const arch = process.arch;
  if (os !== "linux" && os !== "darwin") {
    throw new Error(
      `install-litestream: unsupported platform '${os}'. Litestream binaries ship for linux + darwin only.`,
    );
  }
  if (arch === "x64") return { os, arch: "x86_64" };
  if (arch === "arm64") return { os, arch: "arm64" };
  throw new Error(
    `install-litestream: unsupported arch '${arch}'. Litestream binaries ship for x64 / arm64.`,
  );
}

function downloadUrl(t: ReleaseTarget): string {
  return (
    `https://github.com/benbjohnson/litestream/releases/download/` +
    `v${LITESTREAM_VERSION}/litestream-${LITESTREAM_VERSION}-${t.os}-${t.arch}.tar.gz`
  );
}

async function currentBinaryVersion(binPath: string): Promise<string | undefined> {
  if (!existsSync(binPath)) return undefined;
  try {
    const proc = Bun.spawn([binPath, "version"], {
      stdout: "pipe",
      stderr: "pipe",
    });
    const out = (await new Response(proc.stdout).text()).trim();
    await proc.exited;
    return out.length > 0 ? out : undefined;
  } catch {
    return undefined;
  }
}

async function extractTarball(buf: ArrayBuffer, destDir: string): Promise<string> {
  mkdirSync(destDir, { recursive: true });
  const tarPath = path.join(destDir, "litestream.tar.gz");
  await Bun.write(tarPath, buf);
  const proc = Bun.spawn(["tar", "-xzf", tarPath, "-C", destDir, "litestream"], {
    stdout: "inherit",
    stderr: "inherit",
  });
  const code = await proc.exited;
  if (code !== 0) {
    throw new Error(`install-litestream: tar exited ${code} extracting ${tarPath}`);
  }
  return path.join(destDir, "litestream");
}

async function main(): Promise<void> {
  const binPath = resolvedBinPath();
  const existing = await currentBinaryVersion(binPath);
  if (existing?.includes(LITESTREAM_VERSION)) {
    console.log(`install-litestream: ${binPath} already at v${LITESTREAM_VERSION}`);
    return;
  }

  const target = detectTarget();
  const url = downloadUrl(target);
  console.log(`install-litestream: GET ${url}`);
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`install-litestream: download failed: ${res.status} ${res.statusText}`);
  }
  const buf = await res.arrayBuffer();

  const destDir = path.dirname(binPath);
  const extracted = await extractTarball(buf, destDir);

  if (extracted !== binPath) {
    await Bun.write(binPath, Bun.file(extracted));
  }
  chmodSync(binPath, 0o755);
  console.log(`install-litestream: installed v${LITESTREAM_VERSION} at ${binPath}`);
}

await main();
