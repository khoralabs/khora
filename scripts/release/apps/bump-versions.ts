#!/usr/bin/env bun
/**
 * Bump in-repo package.json versions for released khora apps.
 *
 * Mirrors bumpLibVersions: write the dispatched semver into the manifests that ship
 * together for each product so the repo matches staged/npm artifacts.
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

export const KHORA_APP_PRODUCTS = ["cli", "server", "registry"] as const;
export type KhoraAppProduct = (typeof KHORA_APP_PRODUCTS)[number];

/** Package dirs relative to the workspace root, per release product. */
export const APP_DIRS: Record<KhoraAppProduct, readonly string[]> = {
  cli: ["apps/cli", "apps/daemon"],
  server: ["apps/server"],
  registry: ["apps/registry"],
};

export function bumpAppVersions(
  workspaceRoot: string,
  product: KhoraAppProduct,
  version: string,
): string[] {
  const dirs = APP_DIRS[product];
  const written: string[] = [];
  for (const rel of dirs) {
    const pkgPath = path.join(workspaceRoot, rel, "package.json");
    const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as Record<string, unknown>;
    pkg.version = version;
    writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);
    written.push(pkgPath);
  }
  return written;
}

if (import.meta.main) {
  const product = process.argv[2] as KhoraAppProduct | undefined;
  const version = process.argv[3];
  if (
    product === undefined ||
    !(KHORA_APP_PRODUCTS as readonly string[]).includes(product) ||
    version === undefined ||
    !/^\d+\.\d+\.\d+(?:-[\w.-]+)?(?:\+[\w.-]+)?$/.test(version)
  ) {
    console.error("usage: bump-versions.ts <cli|server|registry> <semver>");
    process.exit(1);
  }
  const workspaceRoot = path.resolve(import.meta.dir, "../../..");
  const written = bumpAppVersions(workspaceRoot, product, version);
  for (const p of written) {
    console.log(`bumped ${path.relative(workspaceRoot, p)} -> ${version}`);
  }
}
