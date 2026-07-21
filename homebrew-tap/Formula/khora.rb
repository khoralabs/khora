class Khora < Formula
  desc "CLI for the Khora agent host"
  homepage "https://github.com/khoralabs/homebrew-tap"
  version "0.1.11"
  license "MIT"

  on_macos do
    on_arm do
      url "https://github.com/khoralabs/homebrew-tap/releases/download/khora-cli-v0.1.11/khora-darwin-arm64.tar.gz"
      sha256 "aa65a5d4f4590ec9bf89897365815d2e7f0da3bd5f998523e31aade756bb2c9e"
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
    assert_match "khora", shell_output("#{bin}/khora", 2)
  end
end
