#!/usr/bin/env bun
/**
 * Build `.tar.gz` release assets for each platform under `release/tarballs/`.
 *
 * Each archive contains:
 *   khora, khora-daemon, configs/, khora-config.schema.json
 *
 * Used by GitHub Releases and the Homebrew formula.
 */
import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { SUPPORTED_TARGETS } from "./stage-khora-release";

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

/** Public GitHub Releases host (private source builds upload assets here). */
export const KHORA_RELEASE_REPO = "khoralabs/homebrew-tap";

export function releaseTagForVersion(version: string): string {
  return `khora-cli-v${version}`;
}

export function tarballFilename(slug: string): string {
  return `khora-${slug}.tar.gz`;
}

export function tarballDownloadUrl(
  version: string,
  slug: string,
  repo = KHORA_RELEASE_REPO,
): string {
  const tag = releaseTagForVersion(version);
  return `https://github.com/${repo}/releases/download/${tag}/${tarballFilename(slug)}`;
}

export async function packageKhoraReleaseTarballs(opts: {
  releaseDir: string;
  version: string;
  outputDir?: string;
}): Promise<ReleaseTarballManifest> {
  const outputDir = opts.outputDir ?? path.join(opts.releaseDir, "tarballs");
  if (existsSync(outputDir)) rmSync(outputDir, { recursive: true, force: true });
  mkdirSync(outputDir, { recursive: true });

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
    const staging = path.join(outputDir, `.staging-${target.slug}`);
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

    const filename = tarballFilename(target.slug);
    const archivePath = path.join(outputDir, filename);
    await Bun.$`tar -czf ${archivePath} -C ${staging} .`.quiet();
    rmSync(staging, { recursive: true, force: true });

    const sha256 = createHash("sha256").update(readFileSync(archivePath)).digest("hex");
    tarballs.push({ slug: target.slug, filename, path: archivePath, sha256 });
  }

  const manifest: ReleaseTarballManifest = {
    version: opts.version,
    tag: releaseTagForVersion(opts.version),
    tarballs,
  };
  await Bun.write(path.join(outputDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

if (import.meta.main) {
  const version = process.argv[2];
  if (!version || !/^\d+\.\d+\.\d+(?:-[\w.-]+)?$/.test(version)) {
    console.error("usage: package-khora-release-tarballs.ts <semver>");
    process.exit(1);
  }
  const workspaceRoot = path.resolve(import.meta.dir, "..");
  const releaseDir = path.join(workspaceRoot, "apps/khora/release");
  const manifest = await packageKhoraReleaseTarballs({ releaseDir, version });
  for (const t of manifest.tarballs) {
    console.log(`${t.filename}  sha256=${t.sha256}`);
  }
}
