class Khora < Formula
  desc "CLI for the Khora agent host"
  homepage "https://github.com/khoralabs/khora"
  version "0.1.0-canary.13"
  license "MIT"

  on_macos do
    on_arm do
      url "https://github.com/khoralabs/khora/releases/download/khora-cli-v0.1.0-canary.13/khora-darwin-arm64.tar.gz"
      sha256 "f116ce7c87fb131a1edffeba7368fecca02b649557ff33ad50b02578000bf4b3"
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
