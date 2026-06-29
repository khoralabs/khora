class Khora < Formula
  desc "CLI for the Khora agent host"
  homepage "https://github.com/khoralabs/khora"
  version "0.1.2"
  license "MIT"

  on_macos do
    on_arm do
      url "https://github.com/khoralabs/khora/releases/download/khora-cli-v0.1.2/khora-darwin-arm64.tar.gz"
      sha256 "14817a389e8e46f3fb669aeb5aa47e64b1195850c444eb21d86c7c9d56061026"
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
