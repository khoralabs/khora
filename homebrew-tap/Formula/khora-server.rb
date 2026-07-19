class KhoraServer < Formula
  desc "Headless Khora agent host server"
  homepage "https://github.com/khoralabs/homebrew-tap"
  version "0.1.2"
  license "MIT"

  depends_on "sqlcipher"
  depends_on "sqlite"

  on_macos do
    on_arm do
      url "https://github.com/khoralabs/homebrew-tap/releases/download/khora-server-v0.1.2/khora-server-darwin-arm64.tar.gz"
      sha256 "d67d4806f076b48bea89e257c5e88cb4aecccda716922e61c6e9c3e88a381cc5"
    end
  end

  on_linux do
    on_intel do
      url "https://github.com/khoralabs/homebrew-tap/releases/download/khora-server-v0.1.2/khora-server-linux-x64.tar.gz"
      sha256 "fb0219750b7b60744399656280f8356572c886e507ae9efee8af179bcb25aaf0"
    end
    on_arm do
      url "https://github.com/khoralabs/homebrew-tap/releases/download/khora-server-v0.1.2/khora-server-linux-arm64.tar.gz"
      sha256 "b3a6d62da16d475e9b5e72948f1d8a3ccbdc3a64e0d6c6745355fd53dcb18397"
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
