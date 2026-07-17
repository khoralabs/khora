class KhoraServer < Formula
  desc "Headless Khora agent host server"
  homepage "https://github.com/khoralabs/khora"
  version "0.1.0"
  license "MIT"

  depends_on "sqlcipher"
  depends_on "sqlite"

  on_macos do
    on_arm do
      url "https://github.com/khoralabs/khora/releases/download/khora-server-v0.1.0/khora-server-darwin-arm64.tar.gz"
      sha256 "2ac4df1b4b800cb9b74b6825a90afe928db75bd818daf4f75f9f900346bc3c19"
    end
  end

  on_linux do
    on_intel do
      url "https://github.com/khoralabs/khora/releases/download/khora-server-v0.1.0/khora-server-linux-x64.tar.gz"
      sha256 "e2c74607e7cc7a2691fd4a4d6f05b909dcbdbd9940322a1e502764bbfede554d"
    end
    on_arm do
      url "https://github.com/khoralabs/khora/releases/download/khora-server-v0.1.0/khora-server-linux-arm64.tar.gz"
      sha256 "2ec1005e152735c4be60e9385c9e8313762cb9fdbae367840d2e992892508343"
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
