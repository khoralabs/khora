import { chmodSync, existsSync, mkdirSync, rmSync } from "node:fs";
import path from "node:path";

export const LITESTREAM_VERSION = "0.5.11";

export type LitestreamOs = "linux" | "darwin";
export type LitestreamArch = "x86_64" | "arm64";

export type LitestreamReleaseTarget = {
  os: LitestreamOs;
  arch: LitestreamArch;
};

/** Minimal platform shape for release staging (compatible with PlatformTarget). */
export type LitestreamPlatform = {
  os: LitestreamOs;
  cpu: "x64" | "arm64";
  slug: string;
};

export function litestreamDownloadUrl(t: LitestreamReleaseTarget): string {
  return (
    `https://github.com/benbjohnson/litestream/releases/download/` +
    `v${LITESTREAM_VERSION}/litestream-${LITESTREAM_VERSION}-${t.os}-${t.arch}.tar.gz`
  );
}

export function detectHostLitestreamTarget(): LitestreamReleaseTarget {
  const os = process.platform;
  const arch = process.arch;
  if (os !== "linux" && os !== "darwin") {
    throw new Error(
      `litestream: unsupported platform '${os}'. Litestream binaries ship for linux + darwin only.`,
    );
  }
  if (arch === "x64") return { os, arch: "x86_64" };
  if (arch === "arm64") return { os, arch: "arm64" };
  throw new Error(
    `litestream: unsupported arch '${arch}'. Litestream binaries ship for x64 / arm64.`,
  );
}

export function platformToLitestreamTarget(platform: LitestreamPlatform): LitestreamReleaseTarget {
  return {
    os: platform.os,
    arch: platform.cpu === "x64" ? "x86_64" : "arm64",
  };
}

export async function currentLitestreamBinaryVersion(binPath: string): Promise<string | undefined> {
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

/** Extract litestream from a release tarball buffer into `destDir`; returns path to binary. */
export async function extractLitestreamTarball(buf: ArrayBuffer, destDir: string): Promise<string> {
  mkdirSync(destDir, { recursive: true });
  const tarPath = path.join(destDir, "litestream.tar.gz");
  await Bun.write(tarPath, buf);
  const proc = Bun.spawn(["tar", "-xzf", tarPath, "-C", destDir, "litestream"], {
    stdout: "inherit",
    stderr: "inherit",
  });
  const code = await proc.exited;
  if (code !== 0) {
    throw new Error(`litestream: tar exited ${code} extracting ${tarPath}`);
  }
  return path.join(destDir, "litestream");
}

/** Download Litestream for `target` and write the binary to `destPath`. */
export async function downloadLitestreamTo(
  target: LitestreamReleaseTarget,
  destPath: string,
  extractDir?: string,
): Promise<void> {
  const url = litestreamDownloadUrl(target);
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`litestream: download failed: ${res.status} ${res.statusText} (${url})`);
  }
  const buf = await res.arrayBuffer();
  const destDir = path.dirname(destPath);
  mkdirSync(destDir, { recursive: true });

  const tmpDir = extractDir ?? destDir;
  const cleanupTmp = extractDir !== undefined;
  if (cleanupTmp) mkdirSync(tmpDir, { recursive: true });

  try {
    const extracted = await extractLitestreamTarball(buf, tmpDir);
    if (extracted !== destPath) {
      await Bun.write(destPath, Bun.file(extracted));
    }
    chmodSync(destPath, 0o755);
  } finally {
    if (cleanupTmp) {
      rmSync(tmpDir, { recursive: true, force: true });
    } else {
      const tarPath = path.join(tmpDir, "litestream.tar.gz");
      if (existsSync(tarPath)) rmSync(tarPath, { force: true });
      const extractedSibling = path.join(tmpDir, "litestream");
      if (extractedSibling !== destPath && existsSync(extractedSibling)) {
        rmSync(extractedSibling, { force: true });
      }
    }
  }
}
