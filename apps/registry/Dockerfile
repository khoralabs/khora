# Khora registry — build from repository root:
#   DOCKER_BUILDKIT=0 docker build --platform linux/amd64 -f apps/khora/registry/Dockerfile -t khora-registry .
#
# Optional: skip Litestream binary (smaller/faster build; set REGISTRY_LITESTREAM only with INSTALL_LITESTREAM=1):
#   docker build --build-arg INSTALL_LITESTREAM=0 ...

FROM --platform=linux/amd64 oven/bun:1.3-debian

ARG INSTALL_LITESTREAM=1

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    ca-certificates \
    libsqlcipher1 \
  && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production \
  SQLCIPHER_CUSTOM_LIB=/usr/lib/x86_64-linux-gnu/libsqlcipher.so.1 \
  REGISTRY_DATABASE_PATH=/data/registry.sqlite \
  PORT=4000

WORKDIR /app

COPY package.json bun.lock bunfig.toml ./
COPY apps ./apps
COPY packages ./packages
COPY scripts/install-litestream.ts ./scripts/install-litestream.ts

RUN bun install --frozen-lockfile --filter '@khoralabs/khora-registry' --production \
  && if [ "$INSTALL_LITESTREAM" = "1" ]; then \
       bun run scripts/install-litestream.ts --output apps/khora/registry/.bin/litestream; \
     fi

RUN mkdir -p /data && chown -R bun:bun /data

WORKDIR /app/apps/khora/registry

USER bun

EXPOSE 4000

VOLUME ["/data"]

CMD ["bun", "run", "start"]
