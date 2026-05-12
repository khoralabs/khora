# syntax=docker/dockerfile:1.7
#
# Atrium host + Litestream sidecar. Build context = repo root:
#
#   docker build -f apps/atrium/host/docker/host/Dockerfile -t atrium-host .
#
# At runtime, Litestream supervises the host binary so SIGTERM from Render
# triggers a clean shutdown with a final WAL sync to S3 (MinIO).

FROM litestream/litestream:0.3.13 AS litestream

FROM oven/bun:1.3.4-alpine AS builder
WORKDIR /workspace
COPY package.json bun.lock bunfig.toml tsconfig.json ./
COPY apps ./apps
COPY packages ./packages
RUN bun install --frozen-lockfile
RUN mkdir -p /out \
 && bun build --compile --target=bun-linux-x64-baseline \
      apps/atrium/host/src/index.ts \
      --outfile /out/atrium-host

FROM alpine:3.20
RUN apk add --no-cache ca-certificates tzdata
COPY --from=litestream /usr/local/bin/litestream /usr/local/bin/litestream
COPY --from=builder /out/atrium-host /usr/local/bin/atrium-host
COPY apps/atrium/host/docker/host/entrypoint.sh /entrypoint.sh
COPY apps/atrium/host/docker/host/litestream.yml /etc/litestream.yml
RUN chmod +x /entrypoint.sh
ENV ATRIUM_DB_PATH=/data/atrium.db \
    LITESTREAM_CONFIG=/etc/litestream.yml \
    PORT=8787
VOLUME /data
EXPOSE 8787
ENTRYPOINT ["/entrypoint.sh"]
