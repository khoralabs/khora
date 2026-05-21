# S3-compatible object store for local Litestream dev (production uses AWS S3; see apps/s3/README.md).
# API :9000, console :9001 — match Litestream MinIO examples:
# https://litestream.io/getting-started/
# mc client image tag: pin to a published minio/mc release (API compatible with MinIO server).
FROM minio/mc:RELEASE.2025-07-21T05-28-08Z AS mc
FROM minio/minio:RELEASE.2025-07-23T15-54-02Z

COPY --from=mc /usr/bin/mc /usr/bin/mc
# Build context must be the repository root (COPY paths are relative to context; Render/CI use root).
COPY apps/s3/entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh /usr/bin/mc

EXPOSE 9000 9001

VOLUME ["/data"]

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
CMD ["server", "/data", "--console-address", ":9001"]
