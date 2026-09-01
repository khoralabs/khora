class KhoraServer < Formula
  desc "Headless Khora agent host server"
  homepage "https://github.com/khoralabs/homebrew-tap"
  version "0.1.18"
  license "MIT"

  depends_on "sqlcipher"
  depends_on "sqlite"

  on_macos do
    on_arm do
      url "https://github.com/khoralabs/homebrew-tap/releases/download/khora-server-v0.1.18/khora-server-darwin-arm64.tar.gz"
      sha256 "6f039fc23581b1ad9c2eaa16cb563c185dcc2d2feafd09098bd5330f08f417eb"
    end
  end

  on_linux do
    on_intel do
      url "https://github.com/khoralabs/homebrew-tap/releases/download/khora-server-v0.1.18/khora-server-linux-x64.tar.gz"
      sha256 "26efd38b8e2720fbc8308bebac87b433e0fba1b0b3066b8ed81be5c3728a51d3"
    end
    on_arm do
      url "https://github.com/khoralabs/homebrew-tap/releases/download/khora-server-v0.1.18/khora-server-linux-arm64.tar.gz"
      sha256 "bd3566c473f21f6045a82f7a799daa6af5ac2aa46f84a9c8808d9515775afc32"
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
