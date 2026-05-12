# Atrium MinIO

A self-configuring [MinIO](https://min.io) S3 server. Built to back continuous SQLite replication for one or more `atrium-host` instances via Litestream.

On boot the container starts MinIO, waits for the API to be ready, then idempotently creates every bucket in `MINIO_BUCKETS`. Restart, redeploy, and scale-to-zero are all safe — `mc mb --ignore-existing` is a no-op when a bucket already exists.

## Partitioning convention: one bucket per host

This image expects one bucket per `atrium-host` instance, named after its hostname:

| Host | Bucket | Litestream `LITESTREAM_S3_BUCKET` |
| --- | --- | --- |
| `atr1` | `atr1` | `atr1` |
| `atr2` | `atr2` | `atr2` |
| `atrN` | `atrN` | `atrN` |

Why per-host buckets instead of one shared bucket with per-host prefixes:
- Object-level credentials and lifecycle rules can be set per bucket later without restructuring storage.
- Litestream's bucket-listing operations stay scoped to one host's snapshots, which matters as the snapshot count grows.
- A blast-radius mistake (`mc rm --recursive`) is bounded to one host.

Initially you'll only have `atr1`. Add `atr2`, `atr3`, … by appending them to `MINIO_BUCKETS` and redeploying MinIO. The bucket bootstrap is idempotent, so existing data is untouched.

## Environment variables

### Required

| Name | Purpose |
| --- | --- |
| `MINIO_ROOT_USER` | Admin username. Also the S3 access key that `atrium-host` sends via `LITESTREAM_ACCESS_KEY_ID`. Treat it as a credential. |
| `MINIO_ROOT_PASSWORD` | Admin password. Also the S3 secret key (`LITESTREAM_SECRET_ACCESS_KEY`). |

### Configuration

| Name | Default | Purpose |
| --- | --- | --- |
| `MINIO_BUCKETS` | _(empty)_ | Comma- or whitespace-separated list of bucket names to ensure on boot. Whitespace around entries is trimmed. Empty entries are skipped. Empty value disables bootstrap entirely. Bucket names cannot legally contain whitespace. |
| `MINIO_HEALTH_RETRY_MAX` | `60` | Seconds the entrypoint will wait for the MinIO API to come up before giving up and exiting. Each retry is a 1-second sleep. |
| `MINIO_BROWSER_REDIRECT_URL` | _(empty)_ | Passes through to MinIO. Leave empty when running behind a single hostname; set to the public console URL when MinIO is behind a reverse proxy that rewrites paths. See [MinIO docs](https://min.io/docs/minio/linux/reference/minio-server/settings/browser.html). |

### Anything else

Any other `MINIO_*` environment variable is passed through to the underlying `minio server` process untouched — see the [MinIO reference](https://min.io/docs/minio/linux/reference/minio-server/settings.html) for the full surface (`MINIO_SITE_REGION`, `MINIO_PROMETHEUS_AUTH_TYPE`, etc.).

## Ports

| Port | Purpose | Recommended exposure |
| --- | --- | --- |
| `9000` | S3 API | **Private only.** Atrium hosts reach it over Render's internal network at `minio.internal:9000`. Never expose to the public internet. |
| `9001` | Web console | Public is fine. Sign in with `MINIO_ROOT_USER` / `MINIO_ROOT_PASSWORD`. |

## Run on Render

1. **Create a private S3 service.** New → Web Service → Docker. Repo: this repo. Dockerfile path: `apps/atrium/host/docker/minio/Dockerfile`. Docker context: `.` (repo root).
2. **Attach a persistent disk** mounted at `/data`. Sizing rule of thumb: every atrium host's full SQLite snapshot + recent WAL deltas; 5–10 GB is plenty for now.
3. **Env vars** (use an env group named e.g. `atrium-minio-creds` so the host service can reuse the same credentials):

   ```
   MINIO_ROOT_USER=<generate>
   MINIO_ROOT_PASSWORD=<generate; 32+ chars>
   MINIO_BUCKETS=atr1
   ```

4. **Health check path:** Set Render's HTTP health check to `GET /minio/health/live` on port 9000. The image does not ship a Dockerfile `HEALTHCHECK` because the upstream MinIO server image (UBI-micro) has neither `curl` nor `wget`.
5. After it's up, point each atrium host at it:

   ```
   LITESTREAM_S3_ENDPOINT=http://minio.internal:9000
   LITESTREAM_S3_BUCKET=atr1
   LITESTREAM_S3_PATH=prod
   LITESTREAM_S3_FORCE_PATH_STYLE=true
   LITESTREAM_ACCESS_KEY_ID=<MINIO_ROOT_USER>
   LITESTREAM_SECRET_ACCESS_KEY=<MINIO_ROOT_PASSWORD>
   ```

   …matching `apps/atrium/host/.env.example` and the env contract documented in [apps/atrium/host/README.md](../../README.md).

## Local quickstart

```bash
docker build \
  -f apps/atrium/host/docker/minio/Dockerfile \
  -t atrium-minio .

docker run --rm -it \
  -p 9000:9000 -p 9001:9001 \
  -v atrium-minio-data:/data \
  -e MINIO_ROOT_USER=minioadmin \
  -e MINIO_ROOT_PASSWORD=minioadmin \
  -e MINIO_BUCKETS=atr1 \
  atrium-minio
```

Console: <http://localhost:9001>. S3 API: <http://localhost:9000>.

## Adding a new host

1. Edit the `MINIO_BUCKETS` env var on the Render service: `atr1,atr2`.
2. Redeploy MinIO. The entrypoint creates the new bucket; existing data and credentials are untouched.
3. Spin up the new atrium-host service with `LITESTREAM_S3_BUCKET=atr2`.

## Gotchas

- **Root credentials are S3 credentials.** This image deliberately doesn't provision per-bucket service accounts — every host that has the root creds can read/write every bucket. Acceptable for a tightly-controlled internal MinIO; if you need bucket-scoped credentials later, add a `mc admin user svcacct add` step to `entrypoint.sh` and propagate the generated keys to each host out of band.
- **Image tag is `:latest`.** Pin both `quay.io/minio/minio` and `quay.io/minio/mc` in the Dockerfile before going beyond experimentation. Look up the latest stable release tag at <https://github.com/minio/minio/releases>.
- **`SET_ENV` style overrides won't trigger re-bootstrap.** Buckets are only created on container start. Editing `MINIO_BUCKETS` requires a redeploy/restart.