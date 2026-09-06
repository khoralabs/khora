class Khora < Formula
  desc "CLI for the Khora agent host"
  homepage "https://github.com/khoralabs/homebrew-tap"
  version "0.1.16"
  license "MIT"

  on_macos do
    on_arm do
      url "https://github.com/khoralabs/homebrew-tap/releases/download/khora-cli-v0.1.16/khora-darwin-arm64.tar.gz"
      sha256 "c1f61e5d26491b99f9e7b077a8afc3c38251495fa2132734a4128abee18589f5"
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
