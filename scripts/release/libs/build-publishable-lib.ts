#!/usr/bin/env bun
/**
 * Shared publish build for lockstep libs (client / host / registry):
 * - JS: bun bundler (private workspace inlined; externals stay imports)
 * - .d.ts: tsc emit + API Extractor rollup per export entry (bundledPackages)
 *
 * Temporarily points bundled workspace package.json `types` at emitted dist/
 * (restored in finally) so API Extractor can resolve bundledPackages.
 *
 * @see https://bun.com/docs/bundler
 * @see https://github.com/oven-sh/bun/issues/5141
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

export type BundledPackage = {
  /** Absolute path to the workspace package root */
  dir: string;
  /** Package name as imported (e.g. @khoralabs/khora-contracts) */
  name: string;
};

export type PublishableLibBuildOptions = {
  packageDir: string;
  repoRoot: string;
  /** npm / sibling packages left external for bun + AE */
  externals: string[];
  /** Private workspace packages inlined into JS and rolled into .d.ts */
  bundledPackages: BundledPackage[];
};

type ExportEntry = {
  exportKey: string;
  /** Absolute path to the TypeScript entry */
  sourceFile: string;
  /** Relative path under dist/ without extension (e.g. index, sqlite, discovery/search) */
  distBase: string;
};

type PkgJson = {
  name?: string;
  types?: string;
  exports?: Record<string, unknown>;
  [key: string]: unknown;
};

export function exportKeyToDistBase(exportKey: string): string {
  if (exportKey === ".") return "index";
  return exportKey.replace(/^\.\//, "");
}

export function parseTsExportEntries(packageDir: string): ExportEntry[] {
  const pkg = JSON.parse(readFileSync(path.join(packageDir, "package.json"), "utf8")) as PkgJson;
  const exportsMap = pkg.exports;
  if (!exportsMap || typeof exportsMap !== "object") {
    throw new Error(`missing exports in ${packageDir}/package.json`);
  }
  const entries: ExportEntry[] = [];
  for (const [exportKey, value] of Object.entries(exportsMap)) {
    if (exportKey.endsWith(".json")) continue;
    let sourceRel: string | undefined;
    if (typeof value === "string") {
      sourceRel = value;
    } else if (value && typeof value === "object") {
      const cond = value as Record<string, unknown>;
      // Prefer implementation paths for bun build; skip pure .d.ts types entries.
      const candidates = [cond.import, cond.default, cond.types];
      for (const c of candidates) {
        if (typeof c === "string" && c.endsWith(".ts") && !c.endsWith(".d.ts")) {
          sourceRel = c;
          break;
        }
      }
    }
    if (!sourceRel?.endsWith(".ts")) continue;
    const sourceFile = path.resolve(packageDir, sourceRel);
    if (!existsSync(sourceFile)) {
      throw new Error(`export ${exportKey} source missing: ${sourceFile}`);
    }
    entries.push({
      exportKey,
      sourceFile,
      distBase: exportKeyToDistBase(exportKey),
    });
  }
  if (entries.length === 0) {
    throw new Error(`no TypeScript export entries in ${packageDir}`);
  }
  return entries;
}

export function mapSrcTypesPathToDist(typesPath: string): string | undefined {
  const normalized = typesPath.replace(/^\.\//, "");
  if (!normalized.startsWith("src/")) return undefined;
  // Already a declaration under src (unusual) — map to dist without double .d.ts
  if (normalized.endsWith(".d.ts")) {
    return `./dist/${normalized.slice("src/".length)}`;
  }
  if (normalized.endsWith(".ts")) {
    return `./dist/${normalized.slice("src/".length).replace(/\.ts$/, ".d.ts")}`;
  }
  return undefined;
}

/** Point package types at ./dist for AE resolution; restore via returned disposer. */
function pointPackageTypesAtDist(pkgDir: string): () => void {
  const pkgPath = path.join(pkgDir, "package.json");
  const original = readFileSync(pkgPath, "utf8");
  const pkg = JSON.parse(original) as PkgJson;
  const dts = "./dist/index.d.ts";
  pkg.types = dts;
  if (pkg.exports && typeof pkg.exports === "object") {
    for (const [key, value] of Object.entries(pkg.exports)) {
      if (!value || typeof value !== "object") continue;
      const exp = value as Record<string, unknown>;
      const typesPath = typeof exp.types === "string" ? exp.types : undefined;
      if (typesPath === undefined) continue;
      const mapped = mapSrcTypesPathToDist(typesPath);
      if (mapped !== undefined) {
        pkg.exports[key] = { ...exp, types: mapped };
      } else if (key === ".") {
        pkg.exports[key] = { ...exp, types: dts };
      }
    }
  }
  writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);
  return () => writeFileSync(pkgPath, original);
}

async function emitPackageDtsToDist(pkgDir: string): Promise<void> {
  const outDir = path.join(pkgDir, "dist");
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });
  const tsconfigPath = path.join(pkgDir, "tsconfig.build.dts.json");
  writeFileSync(
    tsconfigPath,
    `${JSON.stringify(
      {
        include: ["src/**/*.ts"],
        exclude: ["src/**/*.test.ts"],
        compilerOptions: {
          target: "ESNext",
          lib: ["ESNext", "DOM"],
          module: "ESNext",
          moduleResolution: "bundler",
          declaration: true,
          emitDeclarationOnly: true,
          outDir: "dist",
          rootDir: "src",
          strict: true,
          skipLibCheck: true,
          noCheck: true,
          types: ["bun"],
        },
      },
      null,
      2,
    )}\n`,
  );
  try {
    const result = await Bun.$`tsc -p ${tsconfigPath}`.cwd(pkgDir).nothrow();
    if (result.exitCode !== 0) {
      console.error(result.stderr.toString() || result.stdout.toString());
      throw new Error(`declaration emit failed: ${pkgDir}`);
    }
  } finally {
    rmSync(tsconfigPath, { force: true });
  }
  if (!existsSync(path.join(outDir, "index.d.ts"))) {
    throw new Error(`missing dist/index.d.ts after emit: ${pkgDir}`);
  }
}

async function buildJs(opts: {
  packageDir: string;
  entries: ExportEntry[];
  distDir: string;
  externals: string[];
}): Promise<void> {
  const { packageDir, entries, distDir, externals } = opts;
  const externalFlags = externals.flatMap((e) => ["--external", e]);
  for (const entry of entries) {
    const outfile = path.join(distDir, `${entry.distBase}.js`);
    mkdirSync(path.dirname(outfile), { recursive: true });
    const result =
      await Bun.$`bun build ${entry.sourceFile} --outfile=${outfile} --target=node --format=esm ${externalFlags}`
        .cwd(packageDir)
        .nothrow();
    if (result.exitCode !== 0) {
      console.error(result.stderr.toString() || result.stdout.toString());
      throw new Error(`bun build failed for ${entry.exportKey}`);
    }
    // Type-only entrypoints (e.g. contracts barrels) may emit an empty file; keep a stub.
    if (!Bun.file(outfile).size) {
      writeFileSync(outfile, "export {};\n");
    }
  }
}

async function emitMainDts(opts: { packageDir: string; dtsOutDir: string }): Promise<void> {
  const { packageDir, dtsOutDir } = opts;
  rmSync(dtsOutDir, { recursive: true, force: true });
  mkdirSync(dtsOutDir, { recursive: true });

  const existing = path.join(packageDir, "tsconfig.build.json");
  const tsconfigPath = existsSync(existing)
    ? existing
    : path.join(packageDir, "tsconfig.build.generated.json");
  const generated = tsconfigPath.endsWith("generated.json");
  if (generated) {
    writeFileSync(
      tsconfigPath,
      `${JSON.stringify(
        {
          include: ["src/**/*.ts"],
          exclude: ["src/**/*.test.ts"],
          compilerOptions: {
            target: "ESNext",
            lib: ["ESNext", "DOM"],
            module: "ESNext",
            moduleResolution: "bundler",
            declaration: true,
            declarationMap: true,
            emitDeclarationOnly: true,
            outDir: ".dts-build",
            rootDir: "src",
            strict: true,
            skipLibCheck: true,
            noCheck: true,
            types: ["bun"],
            noFallthroughCasesInSwitch: true,
            noUncheckedIndexedAccess: true,
          },
        },
        null,
        2,
      )}\n`,
    );
  }

  try {
    const result = await Bun.$`tsc -p ${tsconfigPath}`.cwd(packageDir).nothrow();
    if (result.exitCode !== 0) {
      console.error(result.stderr.toString() || result.stdout.toString());
      throw new Error(`package declaration emit failed: ${packageDir}`);
    }
  } finally {
    if (generated) rmSync(tsconfigPath, { force: true });
  }
}

async function runApiExtractorPerEntry(opts: {
  packageDir: string;
  entries: ExportEntry[];
  dtsOutDir: string;
  distDir: string;
  bundledPackages: BundledPackage[];
}): Promise<void> {
  const { packageDir, entries, dtsOutDir, distDir, bundledPackages } = opts;
  const bundledNames = bundledPackages.map((p) => p.name);

  for (const entry of entries) {
    const relFromSrc = path.relative(path.join(packageDir, "src"), entry.sourceFile);
    const dtsEntry = path.join(dtsOutDir, relFromSrc.replace(/\.ts$/, ".d.ts"));
    if (!existsSync(dtsEntry)) {
      throw new Error(`missing pre-AE declaration for ${entry.exportKey}: ${dtsEntry}`);
    }
    const rollupPath = path.join(distDir, `${entry.distBase}.d.ts`);
    mkdirSync(path.dirname(rollupPath), { recursive: true });

    const configPath = path.join(
      packageDir,
      `.api-extractor.${entry.distBase.replace(/\//g, "__")}.json`,
    );
    writeFileSync(
      configPath,
      `${JSON.stringify(
        {
          $schema:
            "https://developer.microsoft.com/json-schemas/api-extractor/v7/api-extractor.schema.json",
          mainEntryPointFilePath: path.relative(packageDir, dtsEntry).replace(/\\/g, "/"),
          bundledPackages: bundledNames,
          apiReport: { enabled: false },
          docModel: { enabled: false },
          tsdocMetadata: { enabled: false },
          dtsRollup: {
            enabled: true,
            untrimmedFilePath: path.relative(packageDir, rollupPath).replace(/\\/g, "/"),
          },
          messages: {
            compilerMessageReporting: { default: { logLevel: "warning" } },
            extractorMessageReporting: {
              default: { logLevel: "warning" },
              "ae-missing-release-tag": { logLevel: "none" },
              "ae-forgotten-export": { logLevel: "none" },
              "ae-unresolved-link": { logLevel: "none" },
              "ae-wrong-input-file-type": { logLevel: "warning" },
            },
            tsdocMessageReporting: { default: { logLevel: "none" } },
          },
        },
        null,
        2,
      )}\n`,
    );

    try {
      const extractor = await Bun.$`bunx api-extractor run --local --verbose -c ${configPath}`
        .cwd(packageDir)
        .nothrow();
      if (extractor.exitCode !== 0 || !existsSync(rollupPath)) {
        console.error(extractor.stderr.toString() || extractor.stdout.toString());
        throw new Error(`api-extractor rollup failed for ${entry.exportKey}`);
      }
    } finally {
      rmSync(configPath, { force: true });
    }
  }
}

export async function buildPublishableLib(opts: PublishableLibBuildOptions): Promise<void> {
  const { packageDir, externals, bundledPackages } = opts;
  const distDir = path.join(packageDir, "dist");
  const dtsOutDir = path.join(packageDir, ".dts-build");

  const entries = parseTsExportEntries(packageDir);

  rmSync(distDir, { recursive: true, force: true });
  rmSync(dtsOutDir, { recursive: true, force: true });
  mkdirSync(distDir, { recursive: true });

  await buildJs({ packageDir, entries, distDir, externals });

  const restores: Array<() => void> = [];
  try {
    for (const pkg of bundledPackages) {
      await emitPackageDtsToDist(pkg.dir);
      restores.push(pointPackageTypesAtDist(pkg.dir));
    }

    await emitMainDts({ packageDir, dtsOutDir });
    await runApiExtractorPerEntry({
      packageDir,
      entries,
      dtsOutDir,
      distDir,
      bundledPackages,
    });
  } finally {
    for (const restore of restores.reverse()) {
      try {
        restore();
      } catch (e) {
        console.error("failed to restore package.json", e);
      }
    }
    for (const pkg of bundledPackages) {
      rmSync(path.join(pkg.dir, "dist"), { recursive: true, force: true });
    }
    rmSync(dtsOutDir, { recursive: true, force: true });
  }

  const built = readdirSync(distDir, { recursive: true })
    .map(String)
    .filter((f) => f.endsWith(".js") || f.endsWith(".d.ts"));
  console.log(`built ${packageDir}: ${built.sort().join(", ")}`);
}

/** CLI: bun run scripts/release/libs/build-publishable-lib.ts <client|host|registry> */
if (import.meta.main) {
  const which = process.argv[2];
  const repoRoot = path.resolve(import.meta.dir, "../../..");
  const configs: Record<string, PublishableLibBuildOptions> = {
    client: {
      packageDir: path.join(repoRoot, "packages/client"),
      repoRoot,
      externals: ["@khoralabs/did-key-identity", "zod"],
      bundledPackages: [
        { dir: path.join(repoRoot, "packages/contracts"), name: "@khoralabs/khora-contracts" },
        { dir: path.join(repoRoot, "packages/auth"), name: "@khoralabs/khora-auth" },
      ],
    },
    registry: {
      packageDir: path.join(repoRoot, "packages/registry"),
      repoRoot,
      externals: ["@khoralabs/sqlite-crypto", "@opentelemetry/api", "@tursodatabase/serverless"],
      bundledPackages: [
        { dir: path.join(repoRoot, "packages/colonnade"), name: "@khoralabs/colonnade" },
        { dir: path.join(repoRoot, "packages/auth"), name: "@khoralabs/khora-auth" },
        {
          dir: path.join(repoRoot, "vendor/libs/packages/observability"),
          name: "@khoralabs/observability",
        },
      ],
    },
    host: {
      packageDir: path.join(repoRoot, "packages/host"),
      repoRoot,
      externals: [
        "@khoralabs/khora-registry",
        "@khoralabs/memories-node",
        "@khoralabs/memories-service",
        "@khoralabs/sourcemaps",
        "@khoralabs/sqlite-crypto",
        "zod",
      ],
      bundledPackages: [
        { dir: path.join(repoRoot, "packages/colonnade"), name: "@khoralabs/colonnade" },
        { dir: path.join(repoRoot, "packages/percolator"), name: "@khoralabs/percolator" },
        { dir: path.join(repoRoot, "packages/contracts"), name: "@khoralabs/khora-contracts" },
        { dir: path.join(repoRoot, "packages/auth"), name: "@khoralabs/khora-auth" },
        {
          dir: path.join(repoRoot, "vendor/libs/packages/observability"),
          name: "@khoralabs/observability",
        },
      ],
    },
  };

  const cfg = which ? configs[which] : undefined;
  if (!cfg) {
    console.error(`usage: build-publishable-lib.ts <${Object.keys(configs).join("|")}>`);
    process.exit(1);
  }
  await buildPublishableLib(cfg);
}
