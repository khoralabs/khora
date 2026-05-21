# MinIO for local Litestream dev (AWS S3 in production)

**Production** Atrium and registry backups use **AWS S3** — set `LITESTREAM_S3_BUCKET` and `LITESTREAM_S3_REGION`; omit `LITESTREAM_S3_ENDPOINT`. See `apps/atrium/server/.env.example` and `apps/khoralabs/registry/.env.example`.

This Docker image is **local dev only**: an S3-compatible bucket Litestream can replicate to when you do not want to hit AWS.

## Build

Use the **repository root** as the build context so `COPY apps/s3/entrypoint.sh` resolves (local, Render, and most monorepo CI).

```sh
docker build -t khora-atrium-minio -f apps/s3/Dockerfile .
```

## Run

```sh
docker run -d --name atrium-minio \
  -p 9000:9000 -p 9001:9001 \
  -e MINIO_ROOT_USER=minioadmin \
  -e MINIO_ROOT_PASSWORD=minioadmin \
  -e LITESTREAM_BUCKETS=atrium-backups \
  -v atrium-minio-data:/data \
  khora-atrium-minio
```

- **API:** <http://localhost:9000>
- **Console:** <http://localhost:9001>

On startup, `entrypoint.sh` ensures the Litestream bucket(s) exist (via `mc`). Set **`LITESTREAM_S3_BUCKET`** (single) or **`LITESTREAM_BUCKETS`** (comma-separated; default `atrium-backups`). Litestream itself does not create buckets; this image does for local dev.

Point Atrium/registry at MinIO:

```env
LITESTREAM_S3_ENDPOINT=http://127.0.0.1:9000
LITESTREAM_S3_BUCKET=atrium-backups
LITESTREAM_ACCESS_KEY_ID=minioadmin
LITESTREAM_SECRET_ACCESS_KEY=minioadmin
```

Example replica URL: `s3://atrium-backups/registry/litestream/registry.sqlite` with endpoint in Litestream config (see [MinIO](https://litestream.io/reference/config/#minio-configuration)).
