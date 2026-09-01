class Khora < Formula
  desc "CLI for the Khora agent host"
  homepage "https://github.com/khoralabs/homebrew-tap"
  version "0.1.15"
  license "MIT"

  on_macos do
    on_arm do
      url "https://github.com/khoralabs/homebrew-tap/releases/download/khora-cli-v0.1.15/khora-darwin-arm64.tar.gz"
      sha256 "f75f3aa05a48702b66963637ebaa8b7e5821ccaac5a5c9a816307885badd2fad"
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
