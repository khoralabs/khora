#!/usr/bin/env bun
/**
 * Download the pinned Litestream binary into `apps/atrium/host/.bin/litestream`.
 *
 * Run from the Render build hook (and locally if you want a vendored copy):
 *
 *     bun run --filter @khoralabs/atrium-host install-litestream
 *
 * Idempotent: re-running is a no-op when the existing binary reports the same
 * version. Override the install path with `LITESTREAM_BIN_PATH` if you want
 * the binary somewhere else.
 *
 * Asset naming: v0.5.x publishes `litestream-<version>-<os>-<arch>.tar.gz` with
 * `x86_64` (not `amd64`) and `arm64`. See
 * https://github.com/benbjohnson/litestream/releases/latest.
 */
import { chmodSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";

const LITESTREAM_VERSION = "0.5.11";

const DEFAULT_BIN_PATH = path.resolve(
  import.meta.dir,
  "..",
  "apps/atrium/host/.bin/litestream",
);

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
  const binPath = process.env.LITESTREAM_BIN_PATH?.trim() || DEFAULT_BIN_PATH;
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
