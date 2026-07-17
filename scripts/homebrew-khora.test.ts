import { describe, expect, test } from "bun:test";
import { renderKhoraFormula } from "./bump-homebrew-khora-formula";
import {
  releaseTagForVersion,
  tarballDownloadUrl,
  tarballFilename,
} from "./package-khora-release-tarballs";

describe("release tarball helpers", () => {
  test("release tag and download url", () => {
    expect(releaseTagForVersion("1.2.3")).toBe("khora-cli-v1.2.3");
    expect(tarballFilename("darwin-arm64")).toBe("khora-darwin-arm64.tar.gz");
    expect(tarballDownloadUrl("1.2.3", "darwin-arm64")).toBe(
      "https://github.com/khoralabs/homebrew-tap/releases/download/khora-cli-v1.2.3/khora-darwin-arm64.tar.gz",
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
