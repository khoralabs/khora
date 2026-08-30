import { chmodSync, cpSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import {
  downloadLitestreamTo,
  type LitestreamPlatform,
  platformToLitestreamTarget,
} from "./download";

export async function ensureLitestreamForTarget(
  workspaceRoot: string,
  target: LitestreamPlatform,
  destPath: string,
  localBinPath?: string,
): Promise<void> {
  mkdirSync(path.dirname(destPath), { recursive: true });

  const resolvedLocal = localBinPath ?? path.join(workspaceRoot, "apps/server/.bin/litestream");

  const hostMatches =
    (process.platform === "darwin" && target.os === "darwin") ||
    (process.platform === "linux" && target.os === "linux");
  const archMatches =
    (process.arch === "arm64" && target.cpu === "arm64") ||
    (process.arch === "x64" && target.cpu === "x64");

  if (hostMatches && archMatches && existsSync(resolvedLocal)) {
    cpSync(resolvedLocal, destPath);
    chmodSync(destPath, 0o755);
    return;
  }

  const tmpDir = path.join(workspaceRoot, "apps/release", `.litestream-${target.slug}`);
  await downloadLitestreamTo(platformToLitestreamTarget(target), destPath, tmpDir);
}
