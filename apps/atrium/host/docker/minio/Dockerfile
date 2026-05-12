# syntax=docker/dockerfile:1.7
#
# Thin wrapper over the official MinIO image so it can be deployed as a
# first-class Render service alongside the host. Data lives in /data; the
# S3 API stays internal (9000) while the web console (9001) is exposed.
#
# Required runtime env:
#   MINIO_ROOT_USER       (set on Render via the atrium-minio-creds env group)
#   MINIO_ROOT_PASSWORD
#
# Build context = repo root:
#   docker build -f apps/atrium/host/docker/minio/Dockerfile -t atrium-minio .
FROM minio/minio:RELEASE.2025-04-22T16-49-23Z

ENV MINIO_BROWSER_REDIRECT_URL=""
VOLUME /data
EXPOSE 9000 9001
ENTRYPOINT ["minio"]
CMD ["server", "/data", "--console-address", ":9001"]
