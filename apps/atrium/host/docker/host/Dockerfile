# syntax=docker/dockerfile:1.7
#
# Atrium host + Litestream sidecar. Build context = repo root:
#
#   docker build -f apps/atrium/host/docker/host/Dockerfile -t atrium-host .
#
# We deliberately do NOT use `bun --compile` for the host:
#   - `sqlite-vec` resolves its native extension via Node module lookup
#     (`require.resolve('sqlite-vec-<platform>-<arch>/vec0.so')`). That tree
#     does not exist inside a compiled bunfs.
#   - Bun's bundled SQLite frequently omits `load_extension`, which
#     `sqlite-vec.load(db)` needs. We point SQLITE_CUSTOM_LIB at Alpine's
#     `libsqlite3.so.0` instead.
#
# Litestream supervises the host process so SIGTERM from Render triggers a
# clean shutdown with a final WAL sync to S3 (MinIO).

FROM litestream/litestream:0.3.13 AS litestream

FROM oven/bun:1.3.4-alpine
WORKDIR /app
RUN apk add --no-cache ca-certificates tzdata sqlite-libs
COPY --from=litestream /usr/local/bin/litestream /usr/local/bin/litestream
COPY package.json bun.lock bunfig.toml tsconfig.json ./
COPY apps ./apps
COPY packages ./packages
RUN bun install --frozen-lockfile
COPY apps/atrium/host/docker/host/entrypoint.sh /entrypoint.sh
COPY apps/atrium/host/docker/host/litestream.yml /etc/litestream.yml
RUN chmod +x /entrypoint.sh
ENV ATRIUM_DB_PATH=/data/atrium.db \
    LITESTREAM_CONFIG=/etc/litestream.yml \
    PORT=8787 \
    SQLITE_CUSTOM_LIB=/usr/lib/libsqlite3.so.0 \
    ATRIUM_HOST_ENTRY=/app/apps/atrium/host/src/index.ts
VOLUME /data
EXPOSE 8787
ENTRYPOINT ["/entrypoint.sh"]
