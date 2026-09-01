class KhoraRegistry < Formula
  desc "Khora skill registry server"
  homepage "https://github.com/khoralabs/homebrew-tap"
  version "0.1.0"
  license "MIT"

  depends_on "sqlcipher"
  depends_on "sqlite"

  on_macos do
    on_arm do
      url "https://github.com/khoralabs/homebrew-tap/releases/download/khora-registry-v0.1.0/khora-registry-darwin-arm64.tar.gz"
      sha256 "ddb8213e829c13d5cc0a633f5e2f4f6d00e5279b3160447e3649492c92eedc9c"
    end
  end

  on_linux do
    on_intel do
      url "https://github.com/khoralabs/homebrew-tap/releases/download/khora-registry-v0.1.0/khora-registry-linux-x64.tar.gz"
      sha256 "9b188d4c01e2565c178328a6dfabcf5d1c37cb9240d5c06c0e2290ff3772c69a"
    end
    on_arm do
      url "https://github.com/khoralabs/homebrew-tap/releases/download/khora-registry-v0.1.0/khora-registry-linux-arm64.tar.gz"
      sha256 "88a4b116ddd2a97638bbc23509601488b479dd518716d5010e3e936d768aea06"
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
