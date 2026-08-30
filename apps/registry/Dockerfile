# Slim image from a staged release package (compiled binary + Litestream).
#
# From repository root, after:
#   bun run apps/registry/scripts/build.ts bun-linux-x64
#   bun run scripts/release/registry/stage.ts 0.0.0
#
#   docker build -f apps/registry/Dockerfile \
#     --build-arg RELEASE_SLUG=linux-x64 \
#     -t khora-registry .
#
# RELEASE_SLUG: linux-x64 (amd64) or linux-arm64

ARG RELEASE_SLUG=linux-x64

FROM debian:bookworm-slim

ARG RELEASE_SLUG=linux-x64

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    ca-certificates \
    libsqlcipher1 \
  && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production \
  REGISTRY_DATABASE_PATH=/data/registry.sqlite \
  PORT=4000 \
  KHORA_PACKAGED=1 \
  LITESTREAM_BIN_PATH=/usr/local/bin/litestream

# Do not hardcode SQLCIPHER_CUSTOM_LIB — packaged runtime probes
# /usr/lib/{x86_64,aarch64}-linux-gnu for multi-arch images.

WORKDIR /app

COPY apps/release/registry-${RELEASE_SLUG}/bin/khora-registry /usr/local/bin/khora-registry
COPY apps/release/registry-${RELEASE_SLUG}/bin/litestream /usr/local/bin/litestream

RUN chmod 755 /usr/local/bin/khora-registry /usr/local/bin/litestream \
  && mkdir -p /data \
  && useradd --system --uid 10001 --home /data khora \
  && chown -R khora:khora /data

USER khora

EXPOSE 4000
VOLUME ["/data"]
ENTRYPOINT ["/usr/local/bin/khora-registry"]
