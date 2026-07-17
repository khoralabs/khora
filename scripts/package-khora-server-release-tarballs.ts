#!/usr/bin/env bun
/**
 * Build `.tar.gz` assets for khora-server platform packages.
 *
 * Input: apps/khora/release/server-<slug>/
 * Output: apps/khora/release/server-tarballs/khora-server-<slug>.tar.gz
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { SUPPORTED_TARGETS } from "./stage-khora-release";

export type ServerReleaseTarball = {
  slug: string;
  filename: string;
  path: string;
  sha256: string;
};

export type ServerReleaseTarballManifest = {
  version: string;
  tag: string;
  tarballs: ServerReleaseTarball[];
};

export const KHORA_SERVER_RELEASE_REPO = "khoralabs/khora";

export function serverReleaseTagForVersion(version: string): string {
  return `khora-server-v${version}`;
}

export function serverTarballFilename(slug: string): string {
  return `khora-server-${slug}.tar.gz`;
}

export function serverTarballDownloadUrl(
  version: string,
  slug: string,
  repo = KHORA_SERVER_RELEASE_REPO,
): string {
  const tag = serverReleaseTagForVersion(version);
  return `https://github.com/${repo}/releases/download/${tag}/${serverTarballFilename(slug)}`;
}

export async function packageKhoraServerReleaseTarballs(opts: {
  releaseDir: string;
  version: string;
  outputDir?: string;
}): Promise<ServerReleaseTarballManifest> {
  const outputDir = opts.outputDir ?? path.join(opts.releaseDir, "server-tarballs");
  if (existsSync(outputDir)) rmSync(outputDir, { recursive: true, force: true });
  mkdirSync(outputDir, { recursive: true });

  const tarballs: ServerReleaseTarball[] = [];

  for (const target of SUPPORTED_TARGETS) {
    const staging = path.join(opts.releaseDir, `server-${target.slug}`);
    if (!existsSync(path.join(staging, "bin", "khora-server"))) {
      throw new Error(`missing staged server package at ${staging}`);
    }

    const filename = serverTarballFilename(target.slug);
    const archivePath = path.join(outputDir, filename);
    await Bun.$`tar -czf ${archivePath} -C ${staging} .`.quiet();

    const sha256 = createHash("sha256").update(readFileSync(archivePath)).digest("hex");
    tarballs.push({ slug: target.slug, filename, path: archivePath, sha256 });
  }

  const manifest: ServerReleaseTarballManifest = {
    version: opts.version,
    tag: serverReleaseTagForVersion(opts.version),
    tarballs,
  };
  await Bun.write(path.join(outputDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

if (import.meta.main) {
  const version = process.argv[2];
  if (!version || !/^\d+\.\d+\.\d+(?:-[\w.-]+)?$/.test(version)) {
    console.error("usage: package-khora-server-release-tarballs.ts <semver>");
    process.exit(1);
  }
  const workspaceRoot = path.resolve(import.meta.dir, "..");
  const releaseDir = path.join(workspaceRoot, "apps/khora/release");
  const manifest = await packageKhoraServerReleaseTarballs({ releaseDir, version });
  for (const t of manifest.tarballs) {
    console.log(`${t.filename}  sha256=${t.sha256}`);
  }
}
