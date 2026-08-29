#!/usr/bin/env bash
# Install khora-server from GitHub Releases into PREFIX (default: ~/.local).
set -euo pipefail

REPO="${KHORA_SERVER_REPO:-khoralabs/homebrew-tap}"
PREFIX="${KHORA_SERVER_PREFIX:-$HOME/.local}"
VERSION="${KHORA_SERVER_VERSION:-}"

detect_slug() {
  local os arch
  os="$(uname -s | tr '[:upper:]' '[:lower:]')"
  arch="$(uname -m)"
  case "$os" in
    darwin) os=darwin ;;
    linux) os=linux ;;
    *) echo "unsupported OS: $os" >&2; exit 1 ;;
  esac
  case "$arch" in
    arm64|aarch64) arch=arm64 ;;
    x86_64|amd64) arch=x64 ;;
    *) echo "unsupported arch: $arch" >&2; exit 1 ;;
  esac
  echo "${os}-${arch}"
}

resolve_version() {
  if [ -n "$VERSION" ]; then
    echo "$VERSION"
    return
  fi
  local tag
  tag="$(curl -fsSL "https://api.github.com/repos/${REPO}/releases" \
    | grep -oE '"tag_name": "khora-server-v[^"]+"' \
    | head -n1 \
    | sed -E 's/.*"khora-server-v([^"]+)".*/\1/')"
  if [ -z "$tag" ]; then
    echo "could not resolve latest khora-server release; set KHORA_SERVER_VERSION" >&2
    exit 1
  fi
  echo "$tag"
}

SLUG="$(detect_slug)"
VERSION="$(resolve_version)"
TAG="khora-server-v${VERSION}"
URL="https://github.com/${REPO}/releases/download/${TAG}/khora-server-${SLUG}.tar.gz"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

echo "Downloading ${URL}"
curl -fsSL "$URL" -o "$TMP/khora-server.tar.gz"
mkdir -p "$TMP/extract" "$PREFIX/bin" "$PREFIX/lib"
tar -xzf "$TMP/khora-server.tar.gz" -C "$TMP/extract"

install -m 755 "$TMP/extract/bin/khora-server" "$PREFIX/bin/khora-server"
install -m 755 "$TMP/extract/bin/litestream" "$PREFIX/bin/litestream"
if [ -f "$TMP/extract/lib/vec0.dylib" ]; then
  install -m 644 "$TMP/extract/lib/vec0.dylib" "$PREFIX/lib/vec0.dylib"
elif [ -f "$TMP/extract/lib/vec0.so" ]; then
  install -m 644 "$TMP/extract/lib/vec0.so" "$PREFIX/lib/vec0.so"
fi

echo "Installed khora-server ${VERSION} → ${PREFIX}/bin/khora-server"
echo "Ensure ${PREFIX}/bin is on PATH."
echo "System deps: sqlcipher + sqlite (brew install sqlcipher sqlite | apt install libsqlcipher1 libsqlite3-0)"
