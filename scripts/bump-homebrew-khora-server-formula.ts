#!/usr/bin/env bun
/**
 * Render and sync the Homebrew formula for khora-server.
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  KHORA_SERVER_RELEASE_REPO,
  type ServerReleaseTarballManifest,
  serverReleaseTagForVersion,
  serverTarballDownloadUrl,
} from "./package-khora-server-release-tarballs";

export const HOMEBREW_TAP_REPO = "khoralabs/homebrew-tap";

export function renderKhoraServerFormula(opts: {
  version: string;
  darwinArm64Sha256: string;
  linuxX64Sha256?: string;
  linuxArm64Sha256?: string;
  /** Release-asset repo (defaults to public tap). */
  repo?: string;
  homepage?: string;
}): string {
  const repo = opts.repo ?? KHORA_SERVER_RELEASE_REPO;
  const homepage = opts.homepage ?? `https://github.com/${HOMEBREW_TAP_REPO}`;
  const darwinUrl = serverTarballDownloadUrl(opts.version, "darwin-arm64", repo);
  const linuxX64Url = serverTarballDownloadUrl(opts.version, "linux-x64", repo);
  const linuxArm64Url = serverTarballDownloadUrl(opts.version, "linux-arm64", repo);

  const linuxBlock =
    opts.linuxX64Sha256 !== undefined && opts.linuxArm64Sha256 !== undefined
      ? `
  on_linux do
    on_intel do
      url "${linuxX64Url}"
      sha256 "${opts.linuxX64Sha256}"
    end
    on_arm do
      url "${linuxArm64Url}"
      sha256 "${opts.linuxArm64Sha256}"
    end
  end
`
      : "";

  return `class KhoraServer < Formula
  desc "Headless Khora agent host server"
  homepage "${homepage}"
  version "${opts.version}"
  license "MIT"

  depends_on "sqlcipher"
  depends_on "sqlite"

  on_macos do
    on_arm do
      url "${darwinUrl}"
      sha256 "${opts.darwinArm64Sha256}"
    end
  end
${linuxBlock}
  def install
    bin.install "bin/khora-server"
    bin.install "bin/litestream" => "khora-litestream"
    lib.install Dir["lib/*"]
  end

  def caveats
    <<~EOS
      khora-server requires KHORA_SQLCIPHER_KEY and KHORA_OUTBOX_ENCRYPTION_KEY.
      Data directory defaults to ./data (set KHORA_DATA_DIR).
      Optional Litestream: KHORA_LITESTREAM=1 plus S3 env (see DISTRIBUTION.md).
      Bundled Litestream is installed as khora-litestream.
    EOS
  end

  test do
    assert_predicate bin/"khora-server", :exist?
    assert_predicate bin/"khora-litestream", :exist?
  end
end
`;
}

export function shaFromManifest(manifest: ServerReleaseTarballManifest, slug: string): string {
  const entry = manifest.tarballs.find((t) => t.slug === slug);
  if (entry === undefined) {
    throw new Error(`manifest missing ${slug} tarball`);
  }
  return entry.sha256;
}

export function writeKhoraServerFormula(opts: {
  workspaceRoot: string;
  version: string;
  darwinArm64Sha256: string;
  linuxX64Sha256?: string;
  linuxArm64Sha256?: string;
}): string {
  const formulaDir = path.join(opts.workspaceRoot, "homebrew-tap/Formula");
  mkdirSync(formulaDir, { recursive: true });
  const formulaPath = path.join(formulaDir, "khora-server.rb");
  const body = renderKhoraServerFormula({
    version: opts.version,
    darwinArm64Sha256: opts.darwinArm64Sha256,
    linuxX64Sha256: opts.linuxX64Sha256,
    linuxArm64Sha256: opts.linuxArm64Sha256,
  });
  writeFileSync(formulaPath, body);
  return formulaPath;
}

async function pushFormulaToTapRepo(
  formulaPath: string,
  version: string,
  installScriptPath: string,
): Promise<void> {
  const token = process.env.HOMEBREW_TAP_TOKEN?.trim();
  if (token === undefined || token.length === 0) {
    console.log("HOMEBREW_TAP_TOKEN not set; formula updated locally only");
    return;
  }

  const tmp = mkdtempSync(path.join(tmpdir(), "homebrew-tap-"));
  try {
    const cloneUrl = `https://x-access-token:${token}@github.com/${HOMEBREW_TAP_REPO}.git`;
    const result = await Bun.$`git clone ${cloneUrl} ${tmp}`.nothrow().quiet();
    if (result.exitCode !== 0) {
      throw new Error(
        `failed to clone ${HOMEBREW_TAP_REPO}: ${result.stderr.toString().trim() || result.stdout.toString().trim()}`,
      );
    }

    mkdirSync(path.join(tmp, "Formula"), { recursive: true });
    mkdirSync(path.join(tmp, "scripts"), { recursive: true });
    writeFileSync(path.join(tmp, "Formula/khora-server.rb"), readFileSync(formulaPath, "utf8"));
    writeFileSync(
      path.join(tmp, "scripts/install-khora-server.sh"),
      readFileSync(installScriptPath, "utf8"),
    );
    await Bun.$`chmod +x ${path.join(tmp, "scripts/install-khora-server.sh")}`.quiet();
    await Bun.$`git -C ${tmp} config user.name github-actions[bot]`.quiet();
    await Bun.$`git -C ${tmp} config user.email 41898282+github-actions[bot]@users.noreply.github.com`.quiet();
    await Bun.$`git -C ${tmp} add Formula/khora-server.rb scripts/install-khora-server.sh`.quiet();
    const commit = await Bun.$`git -C ${tmp} commit -m khora-server@${version}`.nothrow().quiet();
    if (commit.exitCode !== 0) {
      const msg = commit.stderr.toString();
      if (msg.includes("nothing to commit")) {
        console.log("homebrew-tap formula already at requested version");
        return;
      }
      throw new Error(`homebrew-tap commit failed: ${msg.trim()}`);
    }
    const push = await Bun.$`git -C ${tmp} push origin HEAD:main`.nothrow().quiet();
    if (push.exitCode !== 0) {
      throw new Error(`homebrew-tap push failed: ${push.stderr.toString().trim()}`);
    }
    console.log(
      `pushed ${HOMEBREW_TAP_REPO} Formula/khora-server.rb + scripts/install-khora-server.sh for ${version}`,
    );
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

if (import.meta.main) {
  const version = process.argv[2];
  if (!version || !/^\d+\.\d+\.\d+(?:-[\w.-]+)?$/.test(version)) {
    console.error("usage: bump-homebrew-khora-server-formula.ts <semver>");
    process.exit(1);
  }

  const workspaceRoot = path.resolve(import.meta.dir, "..");
  const manifestPath = path.join(workspaceRoot, "apps/khora/release/server-tarballs/manifest.json");
  if (!existsSync(manifestPath)) {
    console.error(`missing ${manifestPath}; run package-khora-server-release-tarballs.ts first`);
    process.exit(1);
  }

  const installScriptPath = path.join(workspaceRoot, "apps/khora/server/install.sh");
  if (!existsSync(installScriptPath)) {
    console.error(`missing ${installScriptPath}`);
    process.exit(1);
  }

  // Keep a copy under the tap mirror in this repo for local review.
  const tapScriptsDir = path.join(workspaceRoot, "homebrew-tap/scripts");
  mkdirSync(tapScriptsDir, { recursive: true });
  writeFileSync(
    path.join(tapScriptsDir, "install-khora-server.sh"),
    readFileSync(installScriptPath, "utf8"),
  );

  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as ServerReleaseTarballManifest;
  const formulaPath = writeKhoraServerFormula({
    workspaceRoot,
    version,
    darwinArm64Sha256: shaFromManifest(manifest, "darwin-arm64"),
    linuxX64Sha256: shaFromManifest(manifest, "linux-x64"),
    linuxArm64Sha256: shaFromManifest(manifest, "linux-arm64"),
  });
  console.log(
    `wrote ${path.relative(workspaceRoot, formulaPath)} (${serverReleaseTagForVersion(version)})`,
  );
  await pushFormulaToTapRepo(formulaPath, version, installScriptPath);
}
