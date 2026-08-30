import { chmodSync, cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import type { PlatformTarget } from "./stage-khora-release";

export async function ensureLitestreamForTarget(
  workspaceRoot: string,
  target: PlatformTarget,
  destPath: string,
  localBinPath = path.join(workspaceRoot, "apps/server/.bin/litestream"),
): Promise<void> {
  mkdirSync(path.dirname(destPath), { recursive: true });

  const hostMatches =
    (process.platform === "darwin" && target.os === "darwin") ||
    (process.platform === "linux" && target.os === "linux");
  const archMatches =
    (process.arch === "arm64" && target.cpu === "arm64") ||
    (process.arch === "x64" && target.cpu === "x64");

  if (hostMatches && archMatches) {
    if (existsSync(localBinPath)) {
      cpSync(localBinPath, destPath);
      chmodSync(destPath, 0o755);
      return;
    }
  }

  const arch = target.cpu === "x64" ? "x86_64" : "arm64";
  const version = "0.5.11";
  const url =
    `https://github.com/benbjohnson/litestream/releases/download/` +
    `v${version}/litestream-${version}-${target.os}-${arch}.tar.gz`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`litestream download failed for ${target.slug}: ${res.status}`);
  }
  const tmpDir = path.join(workspaceRoot, "apps/release", `.litestream-${target.slug}`);
  mkdirSync(tmpDir, { recursive: true });
  const tarPath = path.join(tmpDir, "litestream.tar.gz");
  await Bun.write(tarPath, await res.arrayBuffer());
  await Bun.$`tar -xzf ${tarPath} -C ${tmpDir} litestream`.quiet();
  cpSync(path.join(tmpDir, "litestream"), destPath);
  chmodSync(destPath, 0o755);
  rmSync(tmpDir, { recursive: true, force: true });
}
