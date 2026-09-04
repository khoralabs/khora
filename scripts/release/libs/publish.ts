#!/usr/bin/env bun
/**
 * In-place publish for lockstep libs (client → registry → host).
 * Private workspace deps stay bundled via build-publishable-lib / API Extractor;
 * this module rewrites package.json for npm then restores it.
 *
 * Usage:
 *   bun run scripts/release/libs/publish.ts [--dry-run] [--tag <dist-tag>]
 *
 * Expects versions already bumped and packages built.
 */
import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseTsExportEntries } from "./build-publishable-lib";

export const KHORA_LIB_PACKAGES = ["khora-client", "khora-registry", "khora-host"] as const;
export type KhoraLibPackage = (typeof KHORA_LIB_PACKAGES)[number];

/** Publish order: client → registry → host (host depends on the other two). */
export const KHORA_LIB_PUBLISH_ORDER = ["khora-client", "khora-registry", "khora-host"] as const;

export const PKG_DIR: Record<KhoraLibPackage, string> = {
  "khora-client": "packages/client",
  "khora-registry": "packages/registry",
  "khora-host": "packages/host",
};

/** Dist exports keyed by export path (same layout as build-publishable-lib). */
export function publishedExports(
  pkg: KhoraLibPackage,
  packageDir: string,
): Record<string, unknown> {
  const entries = parseTsExportEntries(packageDir);
  const exportsMap: Record<string, unknown> = {};
  for (const entry of entries) {
    const base = entry.distBase;
    exportsMap[entry.exportKey] = {
      types: `./dist/${base}.d.ts`,
      import: `./dist/${base}.js`,
      default: `./dist/${base}.js`,
    };
  }
  if (pkg === "khora-client") {
    exportsMap["./khora-config.schema.json"] = "./khora-config.schema.json";
  }
  return exportsMap;
}

/** Runtime deps shipped on npm (bundled workspace pkgs omitted). */
export function publishedDependencies(
  pkg: KhoraLibPackage,
  version: string,
): Record<string, string> {
  switch (pkg) {
    case "khora-client":
      return {
        "@khoralabs/did-key-identity": "^0.1.0",
        zod: "^4",
      };
    case "khora-registry":
      return {
        "@khoralabs/sqlite-crypto": "^0.1.0",
        "@opentelemetry/api": "^1.9.0",
      };
    case "khora-host":
      return {
        "@khoralabs/khora-registry": version,
        "@khoralabs/memories-node": "^0.11.0",
        "@khoralabs/memories-service": "^0.11.0",
        "@khoralabs/sourcemaps": "^0.1.0",
        "@khoralabs/sqlite-crypto": "^0.1.0",
        zod: "^4",
      };
  }
}

export function publishedOptionalDependencies(
  pkg: KhoraLibPackage,
): Record<string, string> | undefined {
  if (pkg === "khora-registry") {
    return { "@tursodatabase/serverless": "^1.2.3" };
  }
  return undefined;
}

/** Rewrite package.json for npm; returns restore fn. */
export function applyPublishedPackageJson(workspaceRoot: string, pkg: KhoraLibPackage): () => void {
  const pkgDir = path.join(workspaceRoot, PKG_DIR[pkg]);
  const pkgPath = path.join(pkgDir, "package.json");
  const original = readFileSync(pkgPath, "utf8");
  const source = JSON.parse(original) as {
    version: string;
    peerDependencies?: Record<string, string>;
    files?: string[];
  };

  const files =
    pkg === "khora-client"
      ? ["dist", "khora-config.schema.json", "README.md", "LICENSE"]
      : ["dist", "README.md", "LICENSE"];

  const rewritten: Record<string, unknown> = {
    ...JSON.parse(original),
    main: "./dist/index.js",
    types: "./dist/index.d.ts",
    module: "./dist/index.js",
    files,
    exports: publishedExports(pkg, pkgDir),
    dependencies: publishedDependencies(pkg, source.version),
    publishConfig: { access: "public" },
  };

  const optional = publishedOptionalDependencies(pkg);
  if (optional) rewritten.optionalDependencies = optional;
  else delete rewritten.optionalDependencies;

  // peerDependencies stay as in source (may still use catalog: — bun resolves on publish).

  writeFileSync(pkgPath, `${JSON.stringify(rewritten, null, 2)}\n`);
  return () => writeFileSync(pkgPath, original);
}

export function bumpLibVersions(workspaceRoot: string, version: string): void {
  for (const name of KHORA_LIB_PACKAGES) {
    const pkgPath = path.join(workspaceRoot, PKG_DIR[name], "package.json");
    const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as Record<string, unknown>;
    pkg.version = version;
    writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);
  }
}

function publishOne(
  workspaceRoot: string,
  pkg: KhoraLibPackage,
  opts: { dryRun: boolean; tag?: string; token?: string },
): void {
  const pkgDir = path.join(workspaceRoot, PKG_DIR[pkg]);
  let restore: (() => void) | undefined;
  try {
    restore = applyPublishedPackageJson(workspaceRoot, pkg);
    if (opts.dryRun) {
      console.log(`(dry-run) ${pkg}: bun pm pack`);
      const pack = spawnSync("bun", ["pm", "pack", "--quiet"], {
        cwd: pkgDir,
        stdio: "inherit",
      });
      if (pack.status !== 0) {
        throw new Error(`pack failed for ${pkg}`);
      }
      return;
    }
    const args = ["publish", "--access", "public"];
    if (opts.tag) args.push("--tag", opts.tag);
    const result = spawnSync("bun", args, {
      cwd: pkgDir,
      stdio: "inherit",
      env: {
        ...process.env,
        ...(opts.token ? { NPM_CONFIG_TOKEN: opts.token } : {}),
      },
    });
    if (result.status !== 0) {
      throw new Error(`publish failed for ${pkg}`);
    }
  } finally {
    restore?.();
    for (const name of readdirSync(pkgDir)) {
      if (name.endsWith(".tgz")) rmSync(path.join(pkgDir, name), { force: true });
    }
  }
}

export async function publishKhoraLibs(opts: {
  workspaceRoot: string;
  dryRun?: boolean;
  tag?: string;
}): Promise<void> {
  const token =
    process.env.NPM_CONFIG_TOKEN ?? process.env.NPM_TOKEN ?? process.env.NODE_AUTH_TOKEN;
  if (!token && !opts.dryRun) {
    console.warn(
      "Warning: NPM_CONFIG_TOKEN (or NPM_TOKEN) is not set; bun publish may fail without auth.",
    );
  }
  for (const pkg of KHORA_LIB_PUBLISH_ORDER) {
    console.log(`\n→ ${opts.dryRun ? "packing" : "publishing"} ${pkg}`);
    publishOne(opts.workspaceRoot, pkg, {
      dryRun: opts.dryRun === true,
      tag: opts.tag,
      token: token ?? undefined,
    });
  }
}

// Back-compat aliases for tests / callers that used stage names.
export const stagedExports = publishedExports;
export const stagedDependencies = publishedDependencies;
export const stagedOptionalDependencies = publishedOptionalDependencies;

if (import.meta.main) {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const tagIdx = args.indexOf("--tag");
  const tag = tagIdx >= 0 ? args[tagIdx + 1] : undefined;
  if (tagIdx >= 0 && (!tag || tag.startsWith("--"))) {
    console.error("usage: scripts/release/libs/publish.ts [--dry-run] [--tag <dist-tag>]");
    process.exit(1);
  }
  const workspaceRoot = path.resolve(import.meta.dir, "../../..");
  await publishKhoraLibs({ workspaceRoot, dryRun, tag });
  console.log(dryRun ? "\nlibs dry-run complete" : "\npublished lockstep libs");
}
