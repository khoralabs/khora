#!/usr/bin/env bun
/**
 * Stage @khoralabs/khora-client under release/ for npm publish (outside Bun workspaces).
 * Contracts / auth / transport are bundled into the client artifact.
 */
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

export const KHORA_LIB_PACKAGES = ["khora-client"] as const;
export type KhoraLibPackage = (typeof KHORA_LIB_PACKAGES)[number];

const PKG_DIR: Record<KhoraLibPackage, string> = {
  "khora-client": "packages/khora/client",
};

export function stagedClientExports(): Record<string, unknown> {
  return {
    ".": {
      types: "./dist/index.d.ts",
      import: "./dist/index.js",
      default: "./dist/index.js",
    },
    "./khora-config.schema.json": "./khora-config.schema.json",
  };
}

export function stagedDependencies(
  _pkg: KhoraLibPackage,
  _version: string,
): Record<string, string> {
  return {
    "@khoralabs/did-key-identity": "^0.1.0",
    zod: "^4",
  };
}

export async function stageKhoraLibsRelease(opts: {
  workspaceRoot: string;
  version: string;
}): Promise<{ releaseRoot: string; packages: string[] }> {
  const { workspaceRoot, version } = opts;
  const releaseRoot = path.join(workspaceRoot, "release");
  if (existsSync(releaseRoot)) rmSync(releaseRoot, { recursive: true, force: true });
  mkdirSync(releaseRoot, { recursive: true });

  const packages: string[] = [];
  for (const name of KHORA_LIB_PACKAGES) {
    const pkgDir = path.join(workspaceRoot, PKG_DIR[name]);
    const distDir = path.join(pkgDir, "dist");
    if (!existsSync(distDir)) {
      throw new Error(`missing ${distDir}; run package build first`);
    }
    const releaseDir = path.join(releaseRoot, name);
    mkdirSync(releaseDir, { recursive: true });
    cpSync(distDir, path.join(releaseDir, "dist"), { recursive: true });
    for (const file of ["README.md", "LICENSE"]) {
      const src = path.join(pkgDir, file);
      if (existsSync(src)) cpSync(src, path.join(releaseDir, file));
    }
    const schema = path.join(pkgDir, "khora-config.schema.json");
    if (!existsSync(schema)) {
      throw new Error(`missing ${schema}; run build:schema first`);
    }
    cpSync(schema, path.join(releaseDir, "khora-config.schema.json"));

    const source = JSON.parse(readFileSync(path.join(pkgDir, "package.json"), "utf8")) as Record<
      string,
      unknown
    >;
    const staged: Record<string, unknown> = {
      name: source.name,
      version,
      description: source.description,
      license: source.license ?? "MIT",
      type: "module",
      files: source.files,
      repository: source.repository,
      homepage: source.homepage,
      bugs: source.bugs,
      keywords: source.keywords,
      engines: source.engines ?? { node: ">=18" },
      main: "./dist/index.js",
      types: "./dist/index.d.ts",
      exports: stagedClientExports(),
      dependencies: stagedDependencies(name, version),
      peerDependencies: source.peerDependencies,
      publishConfig: { access: "public" },
    };
    writeFileSync(path.join(releaseDir, "package.json"), `${JSON.stringify(staged, null, 2)}\n`);
    packages.push(releaseDir);
  }
  return { releaseRoot, packages };
}

if (import.meta.main) {
  const version = process.argv[2];
  if (!version || !/^\d+\.\d+\.\d+(?:-[\w.-]+)?(?:\+[\w.-]+)?$/.test(version)) {
    console.error("usage: stage-khora-libs-release.ts <semver>");
    process.exit(1);
  }
  const workspaceRoot = path.resolve(import.meta.dir, "..");
  const result = await stageKhoraLibsRelease({ workspaceRoot, version });
  for (const p of result.packages) {
    console.log(`staged ${path.relative(workspaceRoot, p)}`);
  }
}
