class KhoraServer < Formula
  desc "Headless Khora agent host server"
  homepage "https://github.com/khoralabs/homebrew-tap"
  version "0.1.22"
  license "MIT"

  depends_on "sqlcipher"
  depends_on "sqlite"

  on_macos do
    on_arm do
      url "https://github.com/khoralabs/homebrew-tap/releases/download/khora-server-v0.1.22/khora-server-darwin-arm64.tar.gz"
      sha256 "630258d96f081085bcf6e884d40b4d7062df12af3664e5114f94832c27b079c6"
    end
  end

  on_linux do
    on_intel do
      url "https://github.com/khoralabs/homebrew-tap/releases/download/khora-server-v0.1.22/khora-server-linux-x64.tar.gz"
      sha256 "6da65ec6040cdbb2e79f225a18ba6f18da1a8dd6636218df3ed3009f1c11352d"
    end
    on_arm do
      url "https://github.com/khoralabs/homebrew-tap/releases/download/khora-server-v0.1.22/khora-server-linux-arm64.tar.gz"
      sha256 "7c8cfa3da1b2cd70a7e9639668c78d3d737669b191d2ebcb9d5f91fb6e45f5aa"
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
