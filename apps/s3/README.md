# MinIO for Atrium SQLite backups (Litestream)

Run an S3-compatible bucket Litestream can replicate to.

## Build

```sh
docker build -t khora-atrium-minio -f apps/s3/Dockerfile apps/s3
```

## Run

```sh
docker run -d --name atrium-minio \
  -p 9000:9000 -p 9001:9001 \
  -e MINIO_ROOT_USER=minioadmin \
  -e MINIO_ROOT_PASSWORD=minioadmin \
  -e LITESTREAM_S3_BUCKET=atrium-backups \
  -v atrium-minio-data:/data \
  khora-atrium-minio
```

- **API:** <http://localhost:9000>
- **Console:** <http://localhost:9001>

On startup, `entrypoint.sh` ensures the Litestream bucket exists (via `mc`). Set **`LITESTREAM_S3_BUCKET`** to match Atrium’s `LITESTREAM_S3_BUCKET`, or **`LITESTREAM_BUCKETS`** as a comma-separated list (default `atrium-backups` if neither is set). Litestream itself still does not create buckets; this image does.

Use the same access key and secret in Atrium as `LITESTREAM_ACCESS_KEY_ID` / `LITESTREAM_SECRET_ACCESS_KEY` (see `apps/atrium/server/.env.example`).

Example Litestream endpoint: `http://localhost:9000`, bucket in `s3://` URLs: `s3://atrium-backups/...` with that endpoint in config (see Litestream [MinIO](https://litestream.io/reference/config/#minio-configuration)).
