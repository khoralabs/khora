# syntax=docker/dockerfile:1.7
#
# Self-configuring MinIO server. On boot it starts `minio server`, waits for
# readiness, then idempotently creates every bucket listed in `MINIO_BUCKETS`.
# Bucket names are expected to match atrium-host hostnames (e.g. "atr1,atr2")
# so each host gets its own private replica path.
#
# Build context = repo root:
#   docker build -f apps/atrium/host/docker/minio/Dockerfile -t atrium-minio .
#
# Note: docker.io/minio/minio is archived; quay.io is the canonical registry
# MinIO actively publishes to. The MinIO server image does NOT bundle `mc`, so
# we copy it from the official client image.
#
# See ./README.md for the env-var contract and Render deploy instructions.

FROM quay.io/minio/mc:latest AS mc

FROM quay.io/minio/minio:latest

COPY --from=mc /usr/bin/mc /usr/bin/mc
COPY apps/atrium/host/docker/minio/entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

ENV MINIO_BROWSER_REDIRECT_URL="" \
    MINIO_BUCKETS="" \
    MINIO_HEALTH_RETRY_MAX="60"

VOLUME /data
EXPOSE 9000 9001

# No Dockerfile HEALTHCHECK: the MinIO server image is UBI-micro and has no
# curl/wget. Configure Render's HTTP health check to GET
# `/minio/health/live` on port 9000 instead — that endpoint is the canonical
# liveness probe MinIO publishes for orchestrators.

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
