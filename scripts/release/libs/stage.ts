#!/usr/bin/env bun
/**
 * Stage lockstep libs under release/ for npm publish (outside Bun workspaces).
 * Private workspace deps are bundled; sibling publishables pin to the same version.
 */
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseTsExportEntries } from "./build-publishable-lib";

export const KHORA_LIB_PACKAGES = ["khora-client", "khora-registry", "khora-host"] as const;
export type KhoraLibPackage = (typeof KHORA_LIB_PACKAGES)[number];

/** Publish order: client → registry → host (host depends on the other two). */
export const KHORA_LIB_PUBLISH_ORDER = ["khora-client", "khora-registry", "khora-host"] as const;

const PKG_DIR: Record<KhoraLibPackage, string> = {
  "khora-client": "packages/client",
  "khora-registry": "packages/registry",
  "khora-host": "packages/host",
};

const NPM_NAME: Record<KhoraLibPackage, string> = {
  "khora-client": "@khoralabs/khora-client",
  "khora-registry": "@khoralabs/khora-registry",
  "khora-host": "@khoralabs/khora-host",
};

export function stagedExports(pkg: KhoraLibPackage, packageDir: string): Record<string, unknown> {
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

export function stagedDependencies(pkg: KhoraLibPackage, version: string): Record<string, string> {
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
        "@khoralabs/khora-client": version,
        "@khoralabs/khora-registry": version,
        "@khoralabs/memories-node": "^0.7.6",
        "@khoralabs/memories-service": "^0.7.6",
        "@khoralabs/sourcemaps": "^0.1.0",
        "@khoralabs/sqlite-crypto": "^0.1.0",
        zod: "^4",
      };
  }
}

export function stagedOptionalDependencies(
  pkg: KhoraLibPackage,
): Record<string, string> | undefined {
  if (pkg === "khora-registry") {
    return { "@tursodatabase/serverless": "^1.2.3" };
  }
  return undefined;
}

function defaultMeta(pkg: KhoraLibPackage): {
  description: string;
  keywords: string[];
  repository: Record<string, string>;
  homepage: string;
} {
  const dir = PKG_DIR[pkg];
  return {
    description: {
      "khora-client": "Typed HTTP/WS client for Khora hosts.",
      "khora-registry": "Khora registry domain library.",
      "khora-host": "Khora host domain library.",
    }[pkg],
    keywords: ["khora", "khoralabs", pkg.replace("khora-", "")],
    repository: {
      type: "git",
      url: "git+https://github.com/khoralabs/khora.git",
      directory: dir,
    },
    homepage: `https://github.com/khoralabs/khora/tree/main/${dir}`,
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
      else if (file === "LICENSE") {
        const fallback = path.join(workspaceRoot, "packages/client/LICENSE");
        if (existsSync(fallback)) cpSync(fallback, path.join(releaseDir, "LICENSE"));
      }
    }
    if (name === "khora-client") {
      const schema = path.join(pkgDir, "khora-config.schema.json");
      if (!existsSync(schema)) {
        throw new Error(`missing ${schema}; run build:schema first`);
      }
      cpSync(schema, path.join(releaseDir, "khora-config.schema.json"));
    }

    const source = JSON.parse(readFileSync(path.join(pkgDir, "package.json"), "utf8")) as Record<
      string,
      unknown
    >;
    const meta = defaultMeta(name);
    const optional = stagedOptionalDependencies(name);
    const staged: Record<string, unknown> = {
      name: (source.name as string) ?? NPM_NAME[name],
      version,
      description: source.description ?? meta.description,
      license: source.license ?? "MIT",
      type: "module",
      files: ["dist", "README.md", "LICENSE"].concat(
        name === "khora-client" ? ["khora-config.schema.json"] : [],
      ),
      repository: source.repository ?? meta.repository,
      homepage: source.homepage ?? meta.homepage,
      bugs: source.bugs ?? "https://github.com/khoralabs/khora/issues",
      keywords: source.keywords ?? meta.keywords,
      engines: source.engines ?? { node: ">=18" },
      main: "./dist/index.js",
      types: "./dist/index.d.ts",
      exports: stagedExports(name, pkgDir),
      dependencies: stagedDependencies(name, version),
      peerDependencies: source.peerDependencies,
      publishConfig: { access: "public" },
    };
    if (optional) staged.optionalDependencies = optional;
    writeFileSync(path.join(releaseDir, "package.json"), `${JSON.stringify(staged, null, 2)}\n`);
    packages.push(releaseDir);
  }
  return { releaseRoot, packages };
}

if (import.meta.main) {
  const version = process.argv[2];
  if (!version || !/^\d+\.\d+\.\d+(?:-[\w.-]+)?(?:\+[\w.-]+)?$/.test(version)) {
    console.error("usage: scripts/release/libs/stage.ts <semver>");
    process.exit(1);
  }
  const workspaceRoot = path.resolve(import.meta.dir, "../../..");
  const result = await stageKhoraLibsRelease({ workspaceRoot, version });
  for (const p of result.packages) {
    console.log(`staged ${path.relative(workspaceRoot, p)}`);
  }
}
