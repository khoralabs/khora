# syntax=docker/dockerfile:1.7
#
# sql-studio web viewer with an optional Litestream restore on boot.
#
# Reusable for any SQLite file: mount one at $DB_PATH, or set $LITESTREAM_CONFIG
# (and S3 creds) to restore from an S3-compatible replica before serving.
#
# Why Debian (glibc), not Alpine (musl):
#   The upstream `frectonz/sql-studio` binary is glibc-linked. Copying it
#   onto Alpine yields a misleading `exec: sql-studio: not found` at boot
#   because musl can't dlopen the glibc dynamic linker. Litestream is also
#   distributed glibc-linked. Both bins drop into a debian-slim runtime.
#
# Build context = repo root:
#   docker build -f apps/atrium/host/docker/sql-studio/Dockerfile -t sql-studio .

FROM frectonz/sql-studio:0.1.46 AS studio
FROM litestream/litestream:0.3.13 AS litestream

FROM debian:bookworm-slim
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates tzdata \
 && rm -rf /var/lib/apt/lists/*
COPY --from=studio /bin/sql-studio /usr/local/bin/sql-studio
COPY --from=litestream /usr/local/bin/litestream /usr/local/bin/litestream
COPY apps/atrium/host/docker/sql-studio/entrypoint.sh /entrypoint.sh
COPY apps/atrium/host/docker/sql-studio/litestream.yml /etc/litestream.yml
RUN chmod +x /entrypoint.sh
ENV DB_PATH=/data/db.sqlite \
    PORT=3030
VOLUME /data
EXPOSE 3030
ENTRYPOINT ["/entrypoint.sh"]
