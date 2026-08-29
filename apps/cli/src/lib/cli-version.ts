import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const VERSION_ENV = "KHORA_CLI_VERSION";
const ASSETS_DIR_ENV = "KHORA_CLI_ASSETS_DIR";

function readPkgVersionAt(dir: string): string | undefined {
  const pkgPath = path.join(dir, "package.json");
  if (!existsSync(pkgPath)) return undefined;
  try {
    const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as { version?: string };
    return typeof pkg.version === "string" && pkg.version.length > 0 ? pkg.version : undefined;
  } catch {
    return undefined;
  }
}

/** Resolve the CLI semver for `khora version` / `--version`. */
export function resolveCliVersion(env: NodeJS.ProcessEnv = process.env): string {
  const fromEnv = env[VERSION_ENV]?.trim();
  if (fromEnv !== undefined && fromEnv.length > 0) return fromEnv;

  const fromBuild = import.meta.env.KHORA_CLI_VERSION;
  if (typeof fromBuild === "string" && fromBuild.length > 0) return fromBuild;

  const assetsDir = env[ASSETS_DIR_ENV]?.trim();
  if (assetsDir !== undefined && assetsDir.length > 0) {
    const fromAssets = readPkgVersionAt(assetsDir);
    if (fromAssets !== undefined) return fromAssets;
  }

  return readPkgVersionAt(path.resolve(import.meta.dir, "../..")) ?? "0.0.0";
}
