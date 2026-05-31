# Production environment matrix

Reference for deploying the three Khora web services (Render or similar). Per-app `.env.example` files hold local dev defaults; this doc is the **prod wiring map**.

## Services

| Service | Package | Default port | Start command (prod) | Persistent disk |
| --- | --- | --- | --- | --- |
| Khora Labs homepage | `@khoralabs/khoralabs-homepage` | 3000 | `bun run start` | No |
| Khora registry | `@khoralabs/registry` | 4000 | `bun run start` | Yes (`registry.sqlite`) |
| Khora server | `@khoralabs/khora-server` | 8788 | `bun run start` | Yes (catalog, frames, cells) |

Use `bun run start` (not bare `src/index.ts`) on **registry** and **khora-server** so Litestream sidecars run when enabled.

---

## Shared values (must match)

Put these in a Render **Environment Group** (or password manager) and link to every service that needs them.

| Variable | Services | Notes |
| --- | --- | --- |
| `KHORA_INTERNAL_SECRET` | registry, khora-server | **Same value.** Registry calls `POST /internal/mint-invite` on khora-server with `Authorization: Bearer …`. |
| `KHORA_INVITE_PEPPER` | registry, khora-server | **Same value.** Registry hashes minted tokens; khora-server validates invites with the same pepper. |
| `AWS_REGION` | registry, khora-server | e.g. `us-east-1` |
| `AWS_ACCESS_KEY_ID` | registry, khora-server | Render has no IAM roles; use one IAM user for Litestream (+ SES on registry). |
| `AWS_SECRET_ACCESS_KEY` | registry, khora-server | Pair with access key above. |
| `LITESTREAM_S3_BUCKET` | registry, khora-server | e.g. `khora-backups-prod`. One bucket, different prefixes per service. |
| `LITESTREAM_S3_REGION` | registry, khora-server | Match bucket region. Omit `LITESTREAM_S3_ENDPOINT` for real AWS S3. |

### URL consistency

| Concept | Set on | Example prod value |
| --- | --- | --- |
| Registry public URL | registry (`REGISTRY_URL`), khoralabs homepage (`KHORA_REGISTRY_URL`, `BUN_PUBLIC_KHORA_REGISTRY_URL`) | `https://registry.khoralabs.com` |
| Khora server public URL | host registry (`POST /v1/hosts/register` + activate), khora-server (`KHORA_PUBLIC_BASE_URL`) | `https://api.khora.khoralabs.com` |
| Browser origins for registry APIs | Host admin or registry admin → register explicit trusted origins; enable registry participation | e.g. `https://k-0.khoralabs.com`, `https://khoralabs.com` |

Each active host with registry participation enabled contributes its registered **trusted origins** to registry CORS and Better Auth `trustedOrigins`. Host `baseUrl` is not trusted unless explicitly listed (or included via `KHORA_REGISTRY_TRUST_BASE_URL_ORIGIN` on the host).

Registry operators configure host registration trust via `REGISTRY_REGISTRATION_TRUST` (`manual` | `health` | `open`). Self-hosters complete registration and origin setup from the host admin at `/admin/registry`.

---

## Variable matrix

Columns: **R** registry · **K** khora-server · **KH** khoralabs homepage

Legend: **+** = set on this service · **·** = not used · **Kind:** **S** = secret · **C** = config

### HTTP & runtime

| Variable | R | K | KH | Kind | Notes |
| --- | --- | --- | --- | --- | --- |
| `PORT` | + | + | + | C | Render sets automatically; override if needed. |
| `NODE_ENV` | · | · | + | C | `production` for prod builds. |

### URLs & CORS

| Variable | R | K | KH | Kind | Notes |
| --- | --- | --- | --- | --- | --- |
| `REGISTRY_URL` | + | · | · | C | Public base URL for Better Auth (`BETTER_AUTH_URL` alias). |
| `REGISTRY_COOKIE_DOMAIN` | + | · | · | C | Optional, e.g. `.khoralabs.com` for cross-subdomain cookies. |
| `KHORA_REGISTRY_URL` | · | + | + | C | khora-server well-known + opt-in; khoralabs homepage SSR/fetch. |
| `BUN_PUBLIC_KHORA_REGISTRY_URL` | · | · | + | C | Inlined into khoralabs homepage client bundle at build time. |
| `KHORA_HOST_SLUG` | · | + | · | C | Host slug for `/.well-known/khora` and registry opt-in. |
| `KHORA_PUBLIC_BASE_URL` | · | + | · | C | Public base URL in well-known + register body (default loopback + `PORT`). |
| `KHORA_REGISTRY_PARTICIPATE` | · | + | · | C | Legacy: `1`/`true` registers with registry on boot when slug set via env. Prefer `/admin/registry`. |
| `KHORA_REGISTRY_MANAGEMENT_TOKEN` | · | + | · | S | Optional bootstrap override; host admin stores token in `registry-config.json`. |
| `KHORA_REGISTRY_TRUST_BASE_URL_ORIGIN` | · | + | · | C | When syncing, include `KHORA_PUBLIC_BASE_URL` origin in trusted origins. |
| `REGISTRY_REGISTRATION_TRUST` | + | · | · | C | `manual` (default), `health`, or `open` — controls auto-activation policy for self-serve host registration. |
| `REGISTRY_REGISTRATION_REQUIREMENTS` | + | · | · | C | Optional JSON override of registration requirement IDs (extensibility hook). |
| `KHORA_HOST_DISPLAY_NAME` | · | + | · | C | Optional display name for registry register body. |

### Khora CLI (developer machine, not a deployed service)

| Variable | Notes |
| --- | --- |
| `KHORA_REGISTRY_URL` | Registry for `khora host list` / `khora link` (default `http://localhost:4000`). Also set in `~/.khora/cli.config.json` or `--registry-url`. |

Host selection: `khora host use <slug>` writes `currentHost` and `hosts` to `cli.config.json`; override per command with `--host=<slug>`. Registry session after `khora link` is stored in `~/.khora/registry-session` (not env or config).

### Auth & secrets

| Variable | R | K | KH | Kind | Notes |
| --- | --- | --- | --- | --- | --- |
| `BETTER_AUTH_SECRET` | + | · | · | S | ≥32 chars. Registry human auth (OTP). |
| `KHORA_INTERNAL_SECRET` | + | + | · | S | Shared; see table above. |
| `KHORA_INVITE_PEPPER` | + | + | · | S | Shared; see table above. |
| `REGISTRY_CONSOLE_ROOT_TOKEN` | + | · | · | S | ≥16 chars enables `/admin` operator console. |
| `REGISTRY_INTERNAL_SECRET` | + | · | · | S | Optional bearer for `/internal/admin/*`. |
| `KHORA_CONSOLE_ROOT_TOKEN` | · | + | · | S | ≥16 chars enables khora-server `/admin`. |
| `REGISTRY_BOOTSTRAP_EMAILS` | + | · | · | C | Comma-separated emails granted `staff` role on first login. |

### Email (AWS SES)

| Variable | R | K | KH | Kind | Notes |
| --- | --- | --- | --- | --- | --- |
| `SES_FROM_ADDRESS` | + | · | · | C | Verified SES sender for OTP + access-token emails. |
| `AWS_REGION` | + | + | · | C | SES + Litestream region. |
| `AWS_ACCESS_KEY_ID` | + | + | · | S | See shared group. |
| `AWS_SECRET_ACCESS_KEY` | + | + | · | S | See shared group. |
| `REGISTRY_AUTH_OTP_LOG` | + | · | · | C | Dev only: log OTP to stdout instead of SES. |

### Khora persistence

| Variable | R | K | KH | Kind | Notes |
| --- | --- | --- | --- | --- | --- |
| `REGISTRY_DATABASE_PATH` | + | · | · | C | Default `./data/registry.sqlite`. Use Render disk mount path in prod. |
| `KHORA_DATA_DIR` | · | + | · | C | Host persistence root (default `./data`). Derives catalog, frames, cells, memories paths. |
| `KHORA_MEMORIES` | · | + | · | C | `1` / unset = search index on (default); `0` / `off` = disabled (`/v1/search` 503). |
| `KHORA_CELL_POOL_COUNT` | · | + | · | C | Shard pool size (default 16). |
| `KHORA_COLONNADE_CELL_WORKERS` | · | + | · | C | Bun Workers for cell SQLite (default on). |
| `LOG_LEVEL` | · | + | · | C | Pino level (default `info`). |

### Encryption at rest

| Variable | R | K | KH | Kind | Notes |
| --- | --- | --- | --- | --- | --- |
| `KHORA_SQLCIPHER_KEY` | · | + | · | S | **Required.** SQLCipher key for catalog, frames, cells, memories SQLite (≥16 chars). Same key required for Litestream restore. |
| `KHORA_OUTBOX_ENCRYPTION_KEY` | · | + | · | S | **Required.** AES-256-GCM field key for post `outbox.payload` (64-char hex or ≥32 UTF-8 bytes). Separate from SQLCipher. |
| `REGISTRY_SQLCIPHER_KEY` | + | · | · | S | **Required.** SQLCipher key for `registry.sqlite`. |

**Prod checklist (in addition to env vars):**

- Render persistent disks: use encrypted disks (default on paid plans — verify in service settings).
- S3 backup bucket: enable **SSE-KMS** (preferred) or SSE-S3 on `LITESTREAM_S3_BUCKET`; restrict bucket policy to Litestream IAM user only.
- Store encryption keys in Render secret group; never commit. Lost keys = unreadable DBs after restore.
- Beta key rotation: manual SQLCipher rekey + redeploy; document key escrow for disaster recovery.

**Design notes:**

- Post outbox payloads are field-encrypted on disk; `content_hash` is over ciphertext.
- Memories search index remains **plaintext** by design (operator with memories DB can search post text).
- Post creates/updates require detached Ed25519 **content signatures** (`authorSignature`).

### Khora invites & registration

| Variable | R | K | KH | Kind | Notes |
| --- | --- | --- | --- | --- | --- |
| `KHORA_INVITE_REQUIRED` | · | + | · | C | Set `1` to require invite token on registration. |
| `KHORA_INVITES_PER_REGISTRATION` | · | + | · | C | Max invites per registration (default 10). |
| `KHORA_INVITE_SEED_TOKENS` | · | + | · | S | Bootstrap plaintext tokens (hashed at startup). |

### Litestream → S3

| Variable | R | K | KH | Kind | Notes |
| --- | --- | --- | --- | --- | --- |
| `REGISTRY_LITESTREAM` | + | · | · | C | `1` enables Litestream sidecar on registry. |
| `KHORA_LITESTREAM` | · | + | · | C | `1` enables Litestream sidecar on khora-server. |
| `LITESTREAM_S3_BUCKET` | + | + | · | C | Shared bucket name. |
| `LITESTREAM_S3_REGION` | + | + | · | C | Bucket region. |
| `LITESTREAM_S3_KEY_PREFIX` | + | + | · | C | **Different per service:** `registry/litestream` vs `khora/litestream`. |
| `LITESTREAM_LOG_LEVEL` | + | + | · | C | `debug`, `info` (default), `warn`, or `error`. Use `error` in prod to reduce noise. |
| `LITESTREAM_S3_ENDPOINT` | · | · | · | C | **Local MinIO only.** Omit in prod AWS. |
| `LITESTREAM_ACCESS_KEY_ID` | · | · | · | S | MinIO dev only; prod uses `AWS_ACCESS_KEY_ID`. |
| `LITESTREAM_SECRET_ACCESS_KEY` | · | · | · | S | MinIO dev only; prod uses `AWS_SECRET_ACCESS_KEY`. |

---

## Suggested Render environment groups

### `khora-prod-shared` (secrets + AWS)

Link to **registry** and **khora-server**.

```
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
LITESTREAM_S3_BUCKET=khora-backups-prod
LITESTREAM_S3_REGION=us-east-1
KHORA_INTERNAL_SECRET=...
KHORA_INVITE_PEPPER=...
KHORA_SQLCIPHER_KEY=...
KHORA_OUTBOX_ENCRYPTION_KEY=...
REGISTRY_SQLCIPHER_KEY=...
```

### Per-service overrides

**registry**

```
PORT=4000
REGISTRY_URL=https://registry.example.com
REGISTRY_DATABASE_PATH=/data/registry.sqlite
# Host registration trust: manual (default), health (auto-activate on probe), open
# REGISTRY_REGISTRATION_TRUST=manual
# REGISTRY_REGISTRATION_REQUIREMENTS=
BETTER_AUTH_SECRET=...
SES_FROM_ADDRESS=noreply@example.com
REGISTRY_LITESTREAM=1
LITESTREAM_S3_KEY_PREFIX=registry/litestream
REGISTRY_SQLCIPHER_KEY=...
REGISTRY_CONSOLE_ROOT_TOKEN=...
```

**khora-server**

```
PORT=8788
KHORA_DATA_DIR=/data
# KHORA_MEMORIES=0   # omit for default (search index on)
KHORA_INVITE_PEPPER=...          # same as shared group
KHORA_INTERNAL_SECRET=...        # same as shared group
KHORA_LITESTREAM=1
LITESTREAM_S3_KEY_PREFIX=khora/litestream
KHORA_SQLCIPHER_KEY=...
KHORA_OUTBOX_ENCRYPTION_KEY=...
KHORA_CONSOLE_ROOT_TOKEN=...
```

**khoralabs homepage**

```
PORT=3000
KHORA_REGISTRY_URL=https://registry.example.com
BUN_PUBLIC_KHORA_REGISTRY_URL=https://registry.example.com
```

Set `BUN_PUBLIC_*` at **build time** if the platform separates build from runtime (Render: set on the service before deploy).

---

## Access-token / invite flow

Khora Labs homepage POSTs to registry; registry mints via khora-server:

```
khoralabs homepage  →  POST /v1/access-token/request  →  registry
registry            →  POST /internal/mint-invite       →  khora-server  (Bearer KHORA_INTERNAL_SECRET)
registry            →  SES email with plaintext token
```

Requires on **registry**: `KHORA_INTERNAL_SECRET`, `KHORA_INVITE_PEPPER`, `SES_FROM_ADDRESS`, host URL/slug.  
Requires on **khora-server**: matching `KHORA_INTERNAL_SECRET`, `KHORA_INVITE_PEPPER`, invite minting configured.

---

## Generating secrets

```bash
openssl rand -base64 32
```

Use for `BETTER_AUTH_SECRET`, `KHORA_INTERNAL_SECRET`, `KHORA_INVITE_PEPPER`, `*_CONSOLE_ROOT_TOKEN`, `REGISTRY_INTERNAL_SECRET`.

---

## Source `.env.example` files

| App | Path |
| --- | --- |
| Registry | `apps/khoralabs/registry/.env.example` |
| Khora server | `apps/khora/server/.env.example` |
| Khora Labs homepage | `apps/khoralabs/homepage/.env.example` |

Litestream shared logic: `scripts/litestream-config.ts`. Local MinIO: `apps/s3/README.md`.
