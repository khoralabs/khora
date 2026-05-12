# Atrium host Docker stack

Three small images that together run the Atrium host with continuous SQLite
replication to an S3-compatible store, plus a read-only SQL viewer for ops.

| Service       | Image source                                              | Purpose                                          | Public port |
| ------------- | --------------------------------------------------------- | ------------------------------------------------ | ----------- |
| `atrium-host` | `host/Dockerfile`                                         | `bun --compile`'d host + Litestream sidecar      | 8787        |
| `minio`       | `minio/Dockerfile` (wraps `minio/minio`)                  | S3 API for Litestream replicas (private :9000)   | 9001 (UI)   |
| `sql-studio`  | `sql-studio/Dockerfile` (wraps `frectonz/sql-studio`)     | Web viewer; restores from MinIO on boot          | 3030        |

```
apps/atrium/host/docker/
├── README.md
├── docker-compose.yml
├── render.yaml
├── host/{Dockerfile, entrypoint.sh, litestream.yml}
├── sql-studio/{Dockerfile, entrypoint.sh, litestream.yml}
└── minio/Dockerfile
```

## Build commands (context = repo root)

```sh
docker build -f apps/atrium/host/docker/host/Dockerfile       -t atrium-host  .
docker build -f apps/atrium/host/docker/minio/Dockerfile      -t atrium-minio .
docker build -f apps/atrium/host/docker/sql-studio/Dockerfile -t sql-studio   .
```

## Env matrix

Shared (used by Litestream in both `atrium-host` and `sql-studio`):

| Var                            | Required        | Example                          |
| ------------------------------ | --------------- | -------------------------------- |
| `LITESTREAM_ACCESS_KEY_ID`     | yes             | minioadmin                       |
| `LITESTREAM_SECRET_ACCESS_KEY` | yes             | minioadmin                       |
| `LITESTREAM_S3_ENDPOINT`       | yes             | `http://minio.internal:9000`     |
| `LITESTREAM_S3_BUCKET`         | yes             | `atrium-db`                      |
| `LITESTREAM_S3_PATH`           | no (`prod`)     | `prod`                           |
| `LITESTREAM_CONFIG`            | sql-studio only | `/etc/litestream.yml`            |

Per-service:

| Var                | Service       | Default               |
| ------------------ | ------------- | --------------------- |
| `ATRIUM_DB_PATH`   | atrium-host   | `/data/atrium.db`     |
| `PORT`             | atrium-host   | `8787`                |
| `DB_PATH`          | sql-studio    | `/data/db.sqlite`     |
| `PORT`             | sql-studio    | `3030`                |
| `MINIO_ROOT_USER`  | minio         | (required)            |
| `MINIO_ROOT_PASSWORD` | minio      | (required)            |

The host's own runtime knobs (`ATRIUM_BASE_URL`, identity paths, plugin
paths, etc.) live in the host's own config files — see
`apps/atrium/host/README.md`.

## Local quickstart

```sh
docker compose -f apps/atrium/host/docker/docker-compose.yml up --build
```

First run only:

1. Wait for `minio` to be healthy.
2. Open <http://localhost:9001> and sign in with `minioadmin` / `minioadmin`.
3. Create the bucket named `atrium-db`.
4. Restart the host so its Litestream replicate loop picks up the bucket:
   `docker compose restart atrium-host`.
5. Browse <http://localhost:3030> for sql-studio.

Stop with `docker compose down` (data survives in named volumes); use
`docker compose down -v` to wipe.

## Render deploy

1. `git push` the blueprint somewhere Render can see it. Either move
   `render.yaml` to the repo root, symlink it (`ln -s
   apps/atrium/host/docker/render.yaml render.yaml`), or point Render at
   this path in the dashboard.
2. Apply the blueprint. Render will provision:
   - the `atrium-minio-creds` env group (generated access keys), and
   - the three services with their attached disks.
3. Open the public MinIO console URL, sign in with the generated creds, and
   create the bucket `atrium-db`. Litestream does not auto-create buckets.
4. Click "Manual Deploy" on `atrium-host` so the new replicate loop sees
   the bucket; the first deploy's restore is a no-op (empty replica).
5. Hit `https://<atrium-host>.onrender.com/health` to confirm the host is up.

**Internal routing.** On Render the host talks to MinIO at
`http://minio.internal:9000`. Only the MinIO console (`:9001`),
`atrium-host` (`:8787`), and `sql-studio` (`:3030`) are public.

**Note on `fromGroup`/`fromKey`.** Render's exact schema for pulling a
single var out of an env group occasionally evolves; if `fromKey` doesn't
resolve at apply time, switch that pair to two explicit env vars copied
from the group in the dashboard.

## Refreshing sql-studio

sql-studio opens the SQLite file once at startup and holds the fd, so a
live Litestream replicate underneath would serve stale reads after WAL
checkpoints. To pull a fresh snapshot from MinIO:

- Render → `sql-studio` → **Manual Deploy** → **Clear build cache & deploy**.
- Or, locally: `docker compose -f apps/atrium/host/docker/docker-compose.yml \
  up --force-recreate --no-deps sql-studio`.

The disk is wiped on each restart and re-restored via `litestream restore`
before sql-studio starts.

## Reusing sql-studio for other DBs

The sql-studio image isn't Atrium-specific. To point it at an unrelated
SQLite file:

- **Mount a local file:** drop `LITESTREAM_CONFIG`, then `docker run -v
  $PWD/my.db:/data/db.sqlite sql-studio`.
- **Restore from another replica:** swap the `LITESTREAM_S3_*` env vars
  to point at a different bucket/path. The image's `litestream.yml`
  reads everything from env, so no rebuild is needed.

## Gotchas

- **The host runs from source under Bun, not as a `bun --compile` binary.**
  Two reasons: `sqlite-vec` resolves its native extension via Node-style
  module lookup that doesn't exist in a compiled bunfs, and Bun's bundled
  SQLite often omits `load_extension` (which `sqlite-vec.load(db)` calls).
  The image installs Alpine's `sqlite-libs` and sets
  `SQLITE_CUSTOM_LIB=/usr/lib/libsqlite3.so.0` so extension loading works.
  Symptom if you bypass that: `Cannot find module
  'sqlite-vec-linux-x64/vec0.so'` on boot.
- **`minio.internal` only resolves once the MinIO service is deployed.**
  Apply the full blueprint (all three services) before expecting the host
  to start cleanly. On a partial apply you'll see `dial tcp: lookup
  minio.internal: no such host` from Litestream; the host binary won't run
  because Litestream supervises it and exits. sql-studio is more lenient:
  if the replica is unreachable on first boot it serves an empty DB and
  you can redeploy once MinIO is up to pull a real snapshot.
- **First boot on a fresh bucket** logs one `cannot fetch generations`
  error before the first sync. That's normal — Litestream is checking
  whether a replica already exists.

## Known limits / out of scope

- **Auth on sql-studio.** None today. Put it behind Render's IP allowlist,
  Cloudflare Access, or another front door before sharing the URL.
- **MinIO bucket bootstrap.** Manual one-time step in the console after
  first apply (above). Could be automated later by baking `mc` into the
  host image.
- **MinIO hardening.** TLS, anonymous policies, lifecycle rules — left
  to operators. Defaults are fine for a single-tenant prod replica.
- **Native-binary release parity.** The host is `bun --compile`'d *inside*
  the Docker build only. The CLI/daemon release pipeline at
  `scripts/stage-atrium-release.ts` could grow a host target if we ever
  want to ship the host without Docker.
