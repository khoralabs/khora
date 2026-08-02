class KhoraServer < Formula
  desc "Headless Khora agent host server"
  homepage "https://github.com/khoralabs/homebrew-tap"
  version "0.1.15"
  license "MIT"

  depends_on "sqlcipher"
  depends_on "sqlite"

  on_macos do
    on_arm do
      url "https://github.com/khoralabs/homebrew-tap/releases/download/khora-server-v0.1.15/khora-server-darwin-arm64.tar.gz"
      sha256 "d0f368f7788a6f726e99e32be1bda668a58d741b32d8a13fc060438c75b79222"
    end
  end

  on_linux do
    on_intel do
      url "https://github.com/khoralabs/homebrew-tap/releases/download/khora-server-v0.1.15/khora-server-linux-x64.tar.gz"
      sha256 "21ff40e255d2795b0c522806a9426bc447d5354a8c606b49a153e6fffe5944c0"
    end
    on_arm do
      url "https://github.com/khoralabs/homebrew-tap/releases/download/khora-server-v0.1.15/khora-server-linux-arm64.tar.gz"
      sha256 "241b098de07f2dd8f157b34827c0d3e349228f1bc4d9f9ad405774e5744e86fd"
    end
  end

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
