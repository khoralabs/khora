import { describe, expect, test } from "bun:test";
import {
  renderKhoraFormula,
  renderKhoraRegistryFormula,
  renderKhoraServerFormula,
} from "./bump-homebrew-formula";
import {
  releaseTagForVersion,
  tarballDownloadUrl,
  tarballFilename,
} from "./package-release-tarballs";

describe("release tarball helpers", () => {
  test("cli release tag and download url", () => {
    expect(releaseTagForVersion("cli", "1.2.3")).toBe("khora-cli-v1.2.3");
    expect(tarballFilename("cli", "darwin-arm64")).toBe("khora-darwin-arm64.tar.gz");
    expect(tarballDownloadUrl("cli", "1.2.3", "darwin-arm64")).toBe(
      "https://github.com/khoralabs/homebrew-tap/releases/download/khora-cli-v1.2.3/khora-darwin-arm64.tar.gz",
    );
  });

  test("server release tag and download url", () => {
    expect(releaseTagForVersion("server", "1.2.3")).toBe("khora-server-v1.2.3");
    expect(tarballFilename("server", "darwin-arm64")).toBe("khora-server-darwin-arm64.tar.gz");
    expect(tarballDownloadUrl("server", "1.2.3", "darwin-arm64")).toBe(
      "https://github.com/khoralabs/homebrew-tap/releases/download/khora-server-v1.2.3/khora-server-darwin-arm64.tar.gz",
    );
  });

  test("registry release tag and download url", () => {
    expect(releaseTagForVersion("registry", "1.2.3")).toBe("khora-registry-v1.2.3");
    expect(tarballFilename("registry", "darwin-arm64")).toBe("khora-registry-darwin-arm64.tar.gz");
    expect(tarballDownloadUrl("registry", "1.2.3", "darwin-arm64")).toBe(
      "https://github.com/khoralabs/homebrew-tap/releases/download/khora-registry-v1.2.3/khora-registry-darwin-arm64.tar.gz",
    );
  });
});

describe("renderKhoraFormula", () => {
  test("embeds version, url, and sha256 for apple silicon", () => {
    const body = renderKhoraFormula({
      version: "0.2.0",
      darwinArm64Sha256: "abc123",
    });
    expect(body).toContain('version "0.2.0"');
    expect(body).toContain("khora-cli-v0.2.0/khora-darwin-arm64.tar.gz");
    expect(body).toContain("khoralabs/homebrew-tap");
    expect(body).toContain('homepage "https://github.com/khoralabs/homebrew-tap"');
    expect(body).toContain('sha256 "abc123"');
    expect(body).toContain('system bin/"khora", "setup"');
    expect(body).toContain("on_arm");
  });
});

describe("renderKhoraServerFormula", () => {
  test("embeds version, urls, sha256, and deps", () => {
    const body = renderKhoraServerFormula({
      version: "0.2.0",
      darwinArm64Sha256: "abc123",
      linuxX64Sha256: "def456",
      linuxArm64Sha256: "ghi789",
    });
    expect(body).toContain('version "0.2.0"');
    expect(body).toContain("khora-server-v0.2.0/khora-server-darwin-arm64.tar.gz");
    expect(body).toContain("khoralabs/homebrew-tap");
    expect(body).toContain('homepage "https://github.com/khoralabs/homebrew-tap"');
    expect(body).toContain('sha256 "abc123"');
    expect(body).toContain('depends_on "sqlcipher"');
    expect(body).toContain('depends_on "sqlite"');
    expect(body).toContain('bin.install "bin/khora-server"');
    expect(body).toContain('bin.install "bin/litestream" => "khora-litestream"');
    expect(body).toContain("on_linux");
  });
});

describe("renderKhoraRegistryFormula", () => {
  test("embeds version, urls, sha256, and deps", () => {
    const body = renderKhoraRegistryFormula({
      version: "0.2.0",
      darwinArm64Sha256: "abc123",
      linuxX64Sha256: "def456",
      linuxArm64Sha256: "ghi789",
    });
    expect(body).toContain('version "0.2.0"');
    expect(body).toContain("khora-registry-v0.2.0/khora-registry-darwin-arm64.tar.gz");
    expect(body).toContain('depends_on "sqlcipher"');
    expect(body).toContain('bin.install "bin/khora-registry"');
    expect(body).toContain('bin.install "bin/litestream" => "khora-registry-litestream"');
    expect(body).toContain("on_linux");
  });
});
