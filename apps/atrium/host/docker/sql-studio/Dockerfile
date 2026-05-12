# syntax=docker/dockerfile:1.7
#
# sql-studio web viewer with an optional Litestream restore on boot.
#
# Reusable for any SQLite file: mount one at $DB_PATH, or set $LITESTREAM_CONFIG
# (and S3 creds) to restore from an S3-compatible replica before serving.
#
# Build context = repo root:
#   docker build -f apps/atrium/host/docker/sql-studio/Dockerfile -t sql-studio .

FROM frectonz/sql-studio:0.1.51 AS studio
FROM litestream/litestream:0.3.13 AS litestream

FROM alpine:3.20
RUN apk add --no-cache ca-certificates tzdata
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
