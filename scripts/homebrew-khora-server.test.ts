import { describe, expect, test } from "bun:test";
import { renderKhoraServerFormula } from "./bump-homebrew-khora-server-formula";
import {
  serverReleaseTagForVersion,
  serverTarballDownloadUrl,
  serverTarballFilename,
} from "./package-khora-server-release-tarballs";

describe("server release tarball helpers", () => {
  test("release tag and download url", () => {
    expect(serverReleaseTagForVersion("1.2.3")).toBe("khora-server-v1.2.3");
    expect(serverTarballFilename("darwin-arm64")).toBe("khora-server-darwin-arm64.tar.gz");
    expect(serverTarballDownloadUrl("1.2.3", "darwin-arm64")).toBe(
      "https://github.com/khoralabs/homebrew-tap/releases/download/khora-server-v1.2.3/khora-server-darwin-arm64.tar.gz",
    );
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
