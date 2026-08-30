# Slim image from a staged release package (compiled binary + Litestream + vec0).
#
# From repository root, after:
#   bun run apps/server/scripts/build.ts bun-linux-x64   # or bun-linux-arm64
#   bun run scripts/release/server/stage.ts 0.0.0
#
#   docker build -f apps/server/Dockerfile \
#     --build-arg RELEASE_SLUG=linux-x64 \
#     -t khora-server .
#
# RELEASE_SLUG: linux-x64 (amd64) or linux-arm64

ARG RELEASE_SLUG=linux-x64

FROM debian:bookworm-slim

ARG RELEASE_SLUG=linux-x64

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    ca-certificates \
    libsqlcipher1 \
    libsqlite3-0 \
  && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production \
  KHORA_DATA_DIR=/data \
  PORT=8788 \
  KHORA_PACKAGED=1 \
  LITESTREAM_BIN_PATH=/usr/local/bin/litestream \
  SQLITE_VEC_PATH=/usr/local/lib/khora/vec0.so

# Do not hardcode SQLCIPHER_CUSTOM_LIB / SQLITE_CUSTOM_LIB — packaged runtime
# probes /usr/lib/{x86_64,aarch64}-linux-gnu for multi-arch images.

WORKDIR /app

COPY apps/release/server-${RELEASE_SLUG}/bin/khora-server /usr/local/bin/khora-server
COPY apps/release/server-${RELEASE_SLUG}/bin/litestream /usr/local/bin/litestream
COPY apps/release/server-${RELEASE_SLUG}/lib/ /usr/local/lib/khora/

RUN chmod 755 /usr/local/bin/khora-server /usr/local/bin/litestream \
  && mkdir -p /data \
  && useradd --system --uid 10001 --home /data khora \
  && chown -R khora:khora /data

USER khora

EXPOSE 8788
VOLUME ["/data"]
ENTRYPOINT ["/usr/local/bin/khora-server"]
