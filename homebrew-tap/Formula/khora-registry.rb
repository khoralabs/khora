class KhoraRegistry < Formula
  desc "Khora skill registry server"
  homepage "https://github.com/khoralabs/homebrew-tap"
  version "0.0.0"
  license "MIT"

  depends_on "sqlcipher"
  depends_on "sqlite"

  on_macos do
    on_arm do
      url "https://github.com/khoralabs/homebrew-tap/releases/download/khora-registry-v0.0.0/khora-registry-darwin-arm64.tar.gz"
      sha256 "0000000000000000000000000000000000000000000000000000000000000000"
    end
  end

  on_linux do
    on_intel do
      url "https://github.com/khoralabs/homebrew-tap/releases/download/khora-registry-v0.0.0/khora-registry-linux-x64.tar.gz"
      sha256 "0000000000000000000000000000000000000000000000000000000000000000"
    end
    on_arm do
      url "https://github.com/khoralabs/homebrew-tap/releases/download/khora-registry-v0.0.0/khora-registry-linux-arm64.tar.gz"
      sha256 "0000000000000000000000000000000000000000000000000000000000000000"
    end
  end

  def install
    bin.install "bin/khora-registry"
    bin.install "bin/litestream" => "khora-registry-litestream"
  end

  def caveats
    <<~EOS
      khora-registry requires REGISTRY_SQLCIPHER_KEY and BETTER_AUTH_SECRET.
      Database path defaults under the package (set REGISTRY_DATABASE_PATH).
      Optional Litestream: REGISTRY_LITESTREAM=1 plus S3 env (see apps/registry/.env.example).
      Bundled Litestream is installed as khora-registry-litestream.
    EOS
  end

  test do
    assert_predicate bin/"khora-registry", :exist?
    assert_predicate bin/"khora-registry-litestream", :exist?
  end
end
