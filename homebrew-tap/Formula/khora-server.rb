class KhoraServer < Formula
  desc "Headless Khora agent host server"
  homepage "https://github.com/khoralabs/homebrew-tap"
  version "0.1.10"
  license "MIT"

  depends_on "sqlcipher"
  depends_on "sqlite"

  on_macos do
    on_arm do
      url "https://github.com/khoralabs/homebrew-tap/releases/download/khora-server-v0.1.10/khora-server-darwin-arm64.tar.gz"
      sha256 "16ee815e7d18229a5941214e36dfeff05aa40921d05d053a43b194ff1b390853"
    end
  end

  on_linux do
    on_intel do
      url "https://github.com/khoralabs/homebrew-tap/releases/download/khora-server-v0.1.10/khora-server-linux-x64.tar.gz"
      sha256 "d58a6b06450dd447a8ab341e63726d8f621ba93c67f512adbbfaeac3b2516c40"
    end
    on_arm do
      url "https://github.com/khoralabs/homebrew-tap/releases/download/khora-server-v0.1.10/khora-server-linux-arm64.tar.gz"
      sha256 "0fb2aaf9d7dfa89948257848859e812a4a81c422aec8508d000f1a4c96bc781f"
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
