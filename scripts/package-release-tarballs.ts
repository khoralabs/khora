#!/usr/bin/env bun
/**
 * Build `.tar.gz` release assets for cli or server.
 *
 *   bun run scripts/package-release-tarballs.ts cli <semver>
 *   bun run scripts/package-release-tarballs.ts server <semver>
 */
import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { SUPPORTED_TARGETS } from "./stage-khora-release";

export type ReleaseProduct = "cli" | "server";

export type ReleaseTarball = {
  slug: string;
  filename: string;
  path: string;
  sha256: string;
};

export type ReleaseTarballManifest = {
  version: string;
  tag: string;
  tarballs: ReleaseTarball[];
};

export const KHORA_RELEASE_REPO = "khoralabs/homebrew-tap";

export function releaseTagForVersion(product: ReleaseProduct, version: string): string {
  return product === "cli" ? `khora-cli-v${version}` : `khora-server-v${version}`;
}

export function tarballFilename(product: ReleaseProduct, slug: string): string {
  return product === "cli" ? `khora-${slug}.tar.gz` : `khora-server-${slug}.tar.gz`;
}

export function tarballDownloadUrl(
  product: ReleaseProduct,
  version: string,
  slug: string,
  repo = KHORA_RELEASE_REPO,
): string {
  const tag = releaseTagForVersion(product, version);
  return `https://github.com/${repo}/releases/download/${tag}/${tarballFilename(product, slug)}`;
}

export function releaseDir(workspaceRoot: string): string {
  return path.join(workspaceRoot, "apps/release");
}

async function packageCliTarballs(opts: {
  releaseDir: string;
  version: string;
  outputDir: string;
}): Promise<ReleaseTarball[]> {
  const cliMetaDir = path.join(opts.releaseDir, "cli");
  if (!existsSync(path.join(cliMetaDir, "configs"))) {
    throw new Error(`missing staged cli configs at ${path.join(cliMetaDir, "configs")}`);
  }
  const schemaPath = path.join(cliMetaDir, "khora-config.schema.json");
  if (!existsSync(schemaPath)) {
    throw new Error(`missing staged schema at ${schemaPath}`);
  }

  const tarballs: ReleaseTarball[] = [];
  for (const target of SUPPORTED_TARGETS) {
    const staging = path.join(opts.outputDir, `.staging-${target.slug}`);
    mkdirSync(staging, { recursive: true });

    const cliBin = path.join(opts.releaseDir, `cli-${target.slug}`, "khora");
    const daemonBin = path.join(opts.releaseDir, `daemon-${target.slug}`, "khora-daemon");
    if (!existsSync(cliBin) || !existsSync(daemonBin)) {
      throw new Error(`missing release binaries for ${target.slug}`);
    }

    cpSync(cliBin, path.join(staging, "khora"));
    cpSync(daemonBin, path.join(staging, "khora-daemon"));
    cpSync(path.join(cliMetaDir, "configs"), path.join(staging, "configs"), { recursive: true });
    cpSync(schemaPath, path.join(staging, "khora-config.schema.json"));

    const filename = tarballFilename("cli", target.slug);
    const archivePath = path.join(opts.outputDir, filename);
    await Bun.$`tar -czf ${archivePath} -C ${staging} .`.quiet();
    rmSync(staging, { recursive: true, force: true });

    const sha256 = createHash("sha256").update(readFileSync(archivePath)).digest("hex");
    tarballs.push({ slug: target.slug, filename, path: archivePath, sha256 });
  }
  return tarballs;
}

async function packageServerTarballs(opts: {
  releaseDir: string;
  version: string;
  outputDir: string;
}): Promise<ReleaseTarball[]> {
  const tarballs: ReleaseTarball[] = [];
  for (const target of SUPPORTED_TARGETS) {
    const staging = path.join(opts.releaseDir, `server-${target.slug}`);
    if (!existsSync(path.join(staging, "bin", "khora-server"))) {
      throw new Error(`missing staged server package at ${staging}`);
    }

    const filename = tarballFilename("server", target.slug);
    const archivePath = path.join(opts.outputDir, filename);
    await Bun.$`tar -czf ${archivePath} -C ${staging} .`.quiet();

    const sha256 = createHash("sha256").update(readFileSync(archivePath)).digest("hex");
    tarballs.push({ slug: target.slug, filename, path: archivePath, sha256 });
  }
  return tarballs;
}

export async function packageReleaseTarballs(opts: {
  product: ReleaseProduct;
  releaseDir: string;
  version: string;
  outputDir?: string;
}): Promise<ReleaseTarballManifest> {
  const outputDir =
    opts.outputDir ??
    path.join(opts.releaseDir, opts.product === "cli" ? "tarballs" : "server-tarballs");
  if (existsSync(outputDir)) rmSync(outputDir, { recursive: true, force: true });
  mkdirSync(outputDir, { recursive: true });

  const tarballs =
    opts.product === "cli"
      ? await packageCliTarballs({ ...opts, outputDir })
      : await packageServerTarballs({ ...opts, outputDir });

  const manifest: ReleaseTarballManifest = {
    version: opts.version,
    tag: releaseTagForVersion(opts.product, opts.version),
    tarballs,
  };
  await Bun.write(path.join(outputDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

if (import.meta.main) {
  const product = process.argv[2] as ReleaseProduct | undefined;
  const version = process.argv[3];
  if (product !== "cli" && product !== "server") {
    console.error("usage: package-release-tarballs.ts <cli|server> <semver>");
    process.exit(1);
  }
  if (!version || !/^\d+\.\d+\.\d+(?:-[\w.-]+)?$/.test(version)) {
    console.error("usage: package-release-tarballs.ts <cli|server> <semver>");
    process.exit(1);
  }
  const workspaceRoot = path.resolve(import.meta.dir, "..");
  const manifest = await packageReleaseTarballs({
    product,
    releaseDir: releaseDir(workspaceRoot),
    version,
  });
  for (const t of manifest.tarballs) {
    console.log(`${t.filename}  sha256=${t.sha256}`);
  }
}
