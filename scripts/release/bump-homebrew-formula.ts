#!/usr/bin/env bun
/**
 * Render and sync Homebrew formulas for khora CLI, khora-server, or khora-registry.
 *
 *   bun run scripts/release/bump-homebrew-formula.ts cli <semver>
 *   bun run scripts/release/bump-homebrew-formula.ts server <semver>
 *   bun run scripts/release/bump-homebrew-formula.ts registry <semver>
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  KHORA_RELEASE_REPO,
  type ReleaseProduct,
  type ReleaseTarballManifest,
  releaseDir,
  releaseTagForVersion,
  tarballDownloadUrl,
} from "./package-tarballs";

export const HOMEBREW_TAP_REPO = "khoralabs/homebrew-tap";

export function renderKhoraFormula(opts: {
  version: string;
  darwinArm64Sha256: string;
  repo?: string;
  homepage?: string;
}): string {
  const repo = opts.repo ?? KHORA_RELEASE_REPO;
  const homepage = opts.homepage ?? `https://github.com/${HOMEBREW_TAP_REPO}`;
  const url = tarballDownloadUrl("cli", opts.version, "darwin-arm64", repo);
  return `class Khora < Formula
  desc "CLI for the Khora agent host"
  homepage "${homepage}"
  version "${opts.version}"
  license "MIT"

  on_macos do
    on_arm do
      url "${url}"
      sha256 "${opts.darwinArm64Sha256}"
    end
  end

  def install
    bin.install "khora"
    bin.install "khora-daemon"
    pkgshare.install "configs"
    pkgshare.install "khora-config.schema.json"
  end

  def post_install
    ENV["KHORA_CLI_ASSETS_DIR"] = pkgshare.to_s
    system bin/"khora", "setup"
  end

  test do
    assert_match "khora", shell_output("#{bin}/khora", 1)
  end
end
`;
}

export function renderKhoraServerFormula(opts: {
  version: string;
  darwinArm64Sha256: string;
  linuxX64Sha256?: string;
  linuxArm64Sha256?: string;
  repo?: string;
  homepage?: string;
}): string {
  const repo = opts.repo ?? KHORA_RELEASE_REPO;
  const homepage = opts.homepage ?? `https://github.com/${HOMEBREW_TAP_REPO}`;
  const darwinUrl = tarballDownloadUrl("server", opts.version, "darwin-arm64", repo);
  const linuxX64Url = tarballDownloadUrl("server", opts.version, "linux-x64", repo);
  const linuxArm64Url = tarballDownloadUrl("server", opts.version, "linux-arm64", repo);

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

export function renderKhoraRegistryFormula(opts: {
  version: string;
  darwinArm64Sha256: string;
  linuxX64Sha256?: string;
  linuxArm64Sha256?: string;
  repo?: string;
  homepage?: string;
}): string {
  const repo = opts.repo ?? KHORA_RELEASE_REPO;
  const homepage = opts.homepage ?? `https://github.com/${HOMEBREW_TAP_REPO}`;
  const darwinUrl = tarballDownloadUrl("registry", opts.version, "darwin-arm64", repo);
  const linuxX64Url = tarballDownloadUrl("registry", opts.version, "linux-x64", repo);
  const linuxArm64Url = tarballDownloadUrl("registry", opts.version, "linux-arm64", repo);

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

  return `class KhoraRegistry < Formula
  desc "Khora skill registry server"
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
    bin.install "bin/khora-registry"
    bin.install "bin/litestream" => "khora-registry-litestream"
  end

  def caveats
    <<~EOS
      khora-registry requires REGISTRY_SQLCIPHER_KEY and BETTER_AUTH_SECRET.
      Database path defaults under the package (set REGISTRY_DATABASE_PATH).
      Optional Litestream: REGISTRY_LITESTREAM=1 plus S3 env (see apps/registry/.env.example).
      Bundled Litestream is installed as khora-registry-litestream.
    EOS
  end

  test do
    assert_predicate bin/"khora-registry", :exist?
    assert_predicate bin/"khora-registry-litestream", :exist?
  end
end
`;
}

export function shaFromManifest(manifest: ReleaseTarballManifest, slug: string): string {
  const entry = manifest.tarballs.find((t) => t.slug === slug);
  if (entry === undefined) {
    throw new Error(`manifest missing ${slug} tarball`);
  }
  return entry.sha256;
}

async function pushToTapRepo(opts: {
  files: Array<{ local: string; remote: string }>;
  commitMessage: string;
}): Promise<void> {
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

    for (const f of opts.files) {
      mkdirSync(path.dirname(path.join(tmp, f.remote)), { recursive: true });
      writeFileSync(path.join(tmp, f.remote), readFileSync(f.local, "utf8"));
      if (f.remote.endsWith(".sh")) {
        await Bun.$`chmod +x ${path.join(tmp, f.remote)}`.quiet();
      }
    }
    await Bun.$`git -C ${tmp} config user.name github-actions[bot]`.quiet();
    await Bun.$`git -C ${tmp} config user.email 41898282+github-actions[bot]@users.noreply.github.com`.quiet();
    await Bun.$`git -C ${tmp} add ${opts.files.map((f) => f.remote)}`.quiet();
    const commit = await Bun.$`git -C ${tmp} commit -m ${opts.commitMessage}`.nothrow().quiet();
    if (commit.exitCode !== 0) {
      const msg = commit.stderr.toString();
      if (msg.includes("nothing to commit")) {
        console.log("homebrew-tap already at requested version");
        return;
      }
      throw new Error(`homebrew-tap commit failed: ${msg.trim()}`);
    }
    const push = await Bun.$`git -C ${tmp} push origin HEAD:main`.nothrow().quiet();
    if (push.exitCode !== 0) {
      throw new Error(`homebrew-tap push failed: ${push.stderr.toString().trim()}`);
    }
    console.log(`pushed ${HOMEBREW_TAP_REPO} (${opts.commitMessage})`);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

async function bumpCli(workspaceRoot: string, version: string): Promise<void> {
  const manifestPath = path.join(releaseDir(workspaceRoot), "tarballs/manifest.json");
  if (!existsSync(manifestPath)) {
    console.error(`missing ${manifestPath}; run scripts/release/package-tarballs.ts cli first`);
    process.exit(1);
  }

  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as ReleaseTarballManifest;
  const formulaDir = path.join(workspaceRoot, "homebrew-tap/Formula");
  mkdirSync(formulaDir, { recursive: true });
  const formulaPath = path.join(formulaDir, "khora.rb");
  writeFileSync(
    formulaPath,
    renderKhoraFormula({
      version,
      darwinArm64Sha256: shaFromManifest(manifest, "darwin-arm64"),
    }),
  );
  console.log(
    `wrote ${path.relative(workspaceRoot, formulaPath)} (${releaseTagForVersion("cli", version)})`,
  );
  await pushToTapRepo({
    files: [{ local: formulaPath, remote: "Formula/khora.rb" }],
    commitMessage: `khora-cli@${version}`,
  });
}

async function bumpServer(workspaceRoot: string, version: string): Promise<void> {
  const manifestPath = path.join(releaseDir(workspaceRoot), "server-tarballs/manifest.json");
  if (!existsSync(manifestPath)) {
    console.error(`missing ${manifestPath}; run scripts/release/package-tarballs.ts server first`);
    process.exit(1);
  }

  const installScriptPath = path.join(workspaceRoot, "apps/server/install.sh");
  if (!existsSync(installScriptPath)) {
    console.error(`missing ${installScriptPath}`);
    process.exit(1);
  }

  const tapScriptsDir = path.join(workspaceRoot, "homebrew-tap/scripts");
  mkdirSync(tapScriptsDir, { recursive: true });
  const tapInstallPath = path.join(tapScriptsDir, "install-khora-server.sh");
  writeFileSync(tapInstallPath, readFileSync(installScriptPath, "utf8"));

  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as ReleaseTarballManifest;
  const formulaDir = path.join(workspaceRoot, "homebrew-tap/Formula");
  mkdirSync(formulaDir, { recursive: true });
  const formulaPath = path.join(formulaDir, "khora-server.rb");
  writeFileSync(
    formulaPath,
    renderKhoraServerFormula({
      version,
      darwinArm64Sha256: shaFromManifest(manifest, "darwin-arm64"),
      linuxX64Sha256: shaFromManifest(manifest, "linux-x64"),
      linuxArm64Sha256: shaFromManifest(manifest, "linux-arm64"),
    }),
  );
  console.log(
    `wrote ${path.relative(workspaceRoot, formulaPath)} (${releaseTagForVersion("server", version)})`,
  );
  await pushToTapRepo({
    files: [
      { local: formulaPath, remote: "Formula/khora-server.rb" },
      { local: installScriptPath, remote: "scripts/install-khora-server.sh" },
    ],
    commitMessage: `khora-server@${version}`,
  });
}

async function bumpRegistry(workspaceRoot: string, version: string): Promise<void> {
  const manifestPath = path.join(releaseDir(workspaceRoot), "registry-tarballs/manifest.json");
  if (!existsSync(manifestPath)) {
    console.error(
      `missing ${manifestPath}; run scripts/release/package-tarballs.ts registry first`,
    );
    process.exit(1);
  }

  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as ReleaseTarballManifest;
  const formulaDir = path.join(workspaceRoot, "homebrew-tap/Formula");
  mkdirSync(formulaDir, { recursive: true });
  const formulaPath = path.join(formulaDir, "khora-registry.rb");
  writeFileSync(
    formulaPath,
    renderKhoraRegistryFormula({
      version,
      darwinArm64Sha256: shaFromManifest(manifest, "darwin-arm64"),
      linuxX64Sha256: shaFromManifest(manifest, "linux-x64"),
      linuxArm64Sha256: shaFromManifest(manifest, "linux-arm64"),
    }),
  );
  console.log(
    `wrote ${path.relative(workspaceRoot, formulaPath)} (${releaseTagForVersion("registry", version)})`,
  );
  await pushToTapRepo({
    files: [{ local: formulaPath, remote: "Formula/khora-registry.rb" }],
    commitMessage: `khora-registry@${version}`,
  });
}

if (import.meta.main) {
  const product = process.argv[2] as ReleaseProduct | undefined;
  const version = process.argv[3];
  if (
    (product !== "cli" && product !== "server" && product !== "registry") ||
    !version ||
    !/^\d+\.\d+\.\d+(?:-[\w.-]+)?$/.test(version)
  ) {
    console.error("usage: scripts/release/bump-homebrew-formula.ts <cli|server|registry> <semver>");
    process.exit(1);
  }
  const workspaceRoot = path.resolve(import.meta.dir, "../..");
  if (product === "cli") await bumpCli(workspaceRoot, version);
  else if (product === "server") await bumpServer(workspaceRoot, version);
  else await bumpRegistry(workspaceRoot, version);
}
