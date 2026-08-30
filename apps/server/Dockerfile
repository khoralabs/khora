# Khora server — build from repository root:
#   DOCKER_BUILDKIT=0 docker build --platform linux/amd64 -f apps/server/Dockerfile -t khora-server .
#
# Optional: skip Litestream binary:
#   docker build --build-arg INSTALL_LITESTREAM=0 ...

FROM --platform=linux/amd64 oven/bun:1.3-debian

ARG INSTALL_LITESTREAM=1

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    ca-certificates \
    libsqlcipher1 \
    libsqlite3-0 \
  && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production \
  SQLCIPHER_CUSTOM_LIB=/usr/lib/x86_64-linux-gnu/libsqlcipher.so.1 \
  SQLITE_CUSTOM_LIB=/usr/lib/x86_64-linux-gnu/libsqlite3.so.0 \
  KHORA_DATA_DIR=/data \
  PORT=8788

WORKDIR /app

COPY package.json bun.lock bunfig.toml ./
COPY apps ./apps
COPY packages ./packages
COPY scripts/install-litestream.ts ./scripts/install-litestream.ts

RUN bun install --frozen-lockfile --filter '@khoralabs/khora-server' --production \
  && if [ "$INSTALL_LITESTREAM" = "1" ]; then \
       bun run scripts/install-litestream.ts --output apps/server/.bin/litestream; \
     fi

RUN mkdir -p /data && chown -R bun:bun /data

WORKDIR /app/apps/server

USER bun

EXPOSE 8788

VOLUME ["/data"]

CMD ["bun", "run", "start"]
