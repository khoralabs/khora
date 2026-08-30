# Production environment matrix

Reference for deploying Khora apps (`apps/{cli,daemon,server,registry}`) and libraries (`packages/{client,host,registry,...}`). Per-app `.env.example` files hold local dev defaults; this doc is the **prod wiring map**.

## Services

| Service | Package | Default port | Start command (prod) | Persistent disk |
| --- | --- | --- | --- | --- |
| Khora registry | `@khoralabs/khora-registry` | 4000 | `bun run start` | Yes (`registry.sqlite`) |
| Khora server | `@khoralabs/khora-server` | 8788 | `bun run start` | Yes (host DBs, frames, cells, memories) |

Use `bun run start` (not bare `src/index.ts`) on **registry** and **khora-server** so Litestream sidecars run when enabled.

Both services are **headless**. Operator APIs use Bearer root tokens (`REGISTRY_CONSOLE_ROOT_TOKEN` / `KHORA_CONSOLE_ROOT_TOKEN`) at `/v1/ops` (registry + host) and `/v1/host/registry*` (host registry management).

**CLI / daemon** (`@khoralabs/khora-cli`, `@khoralabs/khora-daemon`) run on developer machines, not as Render web services.

---

## Shared values (must match)

Put these in a Render **Environment Group** (or password manager) and link to every service that needs them.

| Variable | Services | Notes |
| --- | --- | --- |
| `KHORA_INVITE_PEPPER` | khora-server | Host-only. Used to hash minted invite tokens locally; registry never sees plaintext or pepper. |
| `AWS_REGION` | registry, khora-server | e.g. `us-east-1` |
| `AWS_ACCESS_KEY_ID` | registry, khora-server | Render has no IAM roles; use one IAM user for Litestream (+ SES on registry). |
| `AWS_SECRET_ACCESS_KEY` | registry, khora-server | Pair with access key above. |
| `LITESTREAM_S3_BUCKET` | registry, khora-server | e.g. `khora-backups-prod`. One bucket, different prefixes per service. |
| `LITESTREAM_S3_REGION` | registry, khora-server | Match bucket region. Omit `LITESTREAM_S3_ENDPOINT` for real AWS S3. |

**Telemetry wiring (prod):** Point app services’ `OTEL_EXPORTER_OTLP_ENDPOINT` at your OTLP collector (private URL). Do not put Grafana Cloud credentials on the apps.

### URL consistency

| Concept | Set on | Example prod value |
| --- | --- | --- |
| Registry public URL | registry (`REGISTRY_URL`), khora-server (`KHORA_REGISTRY_URL`), CLI (`KHORA_REGISTRY_URL`) | `https://r.khoralabs.com` |
| Khora server public URL | host registry (`POST /v1/hosts/register` + activate), khora-server (`KHORA_PUBLIC_BASE_URL`) | `https://api.khora.khoralabs.com` |
| Browser origins for registry APIs | Host `/v1/host/registry*` or registry `/v1/ops` → register explicit trusted origins; enable registry participation | e.g. `https://k-0.khoralabs.com` |

Each active host with registry participation enabled contributes its registered **trusted origins** to registry CORS and Better Auth `trustedOrigins`. Host `baseUrl` is not trusted unless explicitly listed (or included via `KHORA_REGISTRY_TRUST_BASE_URL_ORIGIN` on the host).

Registry operators configure host registration trust via `REGISTRY_REGISTRATION_TRUST` (`manual` | `health` | `open`). Self-hosters complete registration and origin setup via host `/v1/host/registry*` (Bearer `KHORA_CONSOLE_ROOT_TOKEN`).

---

## Variable matrix

Columns: **R** registry · **K** khora-server

Legend: **+** = set on this service · **·** = not used · **Kind:** **S** = secret · **C** = config

### HTTP & runtime

| Variable | R | K | Kind | Notes |
| --- | --- | --- | --- | --- |
| `PORT` | + | + | C | Render sets automatically; override if needed. Defaults: registry `4000`, server `8788`. |
| `LOG_LEVEL` | + | + | C | Pino level (default `info`). |
| `TRUSTED_PROXIES` | + | + | C | Comma-separated proxy IPs trusted for `X-Forwarded-For` / `X-Real-IP` (aliases: `REGISTRY_TRUSTED_PROXIES`, `KHORA_TRUSTED_PROXIES`). |

### URLs & CORS

| Variable | R | K | Kind | Notes |
| --- | --- | --- | --- | --- |
| `REGISTRY_URL` | + | · | C | Public base URL for Better Auth (`BETTER_AUTH_URL` alias). |
| `REGISTRY_COOKIE_DOMAIN` | + | · | C | Optional explicit cross-subdomain cookie domain (e.g. `.khoralabs.com`). |
| `REGISTRY_COOKIE_PARENT_DOMAIN` | + | · | C | When cookie domain unset, derive `.<parent>` if `REGISTRY_URL` is on that parent (e.g. `khoralabs.com`). |
| `KHORA_REGISTRY_URL` | · | + | C | khora-server well-known + opt-in; CLI default. |
| `KHORA_HOST_SLUG` | · | + | C | Host slug for `/.well-known/khora` and registry opt-in. |
| `KHORA_PUBLIC_BASE_URL` | · | + | C | Public base URL in well-known + register body (default loopback + `PORT`). |
| `KHORA_REGISTRY_PARTICIPATE` | · | + | C | Legacy: `1`/`true` registers with registry on boot when slug set via env. Prefer `/v1/host/registry`. |
| `KHORA_REGISTRY_TRUST_BASE_URL_ORIGIN` | · | + | C | When syncing, include `KHORA_PUBLIC_BASE_URL` origin in trusted origins. |
| `REGISTRY_REGISTRATION_TRUST` | + | · | C | `manual` (default), `health`, or `open` — controls auto-activation policy for self-serve host registration. |
| `REGISTRY_REGISTRATION_REQUIREMENTS` | + | · | C | Optional JSON override of registration requirement IDs (extensibility hook). |
| `KHORA_HOST_DISPLAY_NAME` | · | + | C | Optional display name for registry register body. |

### Khora CLI (developer machine, not a deployed service)

| Variable | Notes |
| --- | --- |
| `KHORA_REGISTRY_URL` | Registry for `khora host list` / `khora link` (default `http://localhost:4000`). Also set in `~/.khora/cli.config.json` or `--registry-url`. |

Host selection: `khora host use <slug>` writes `currentHost` and `hosts` to `cli.config.json`; override per command with `--host=<slug>`. Registry session after `khora link` is stored in `~/.khora/registry-session` (not env or config).

### Auth & secrets

| Variable | R | K | Kind | Notes |
| --- | --- | --- | --- | --- |
| `BETTER_AUTH_SECRET` | + | · | S | **Required** ≥32 chars. Registry refuses to start if missing/short. Human auth (OTP). |
| `KHORA_INVITE_PEPPER` | · | + | S | khora-server only; local invite mint + validation. |
| `REGISTRY_CONSOLE_ROOT_TOKEN` | + | · | S | ≥16 chars enables registry `/v1/ops/*` (Bearer). |
| `KHORA_CONSOLE_ROOT_TOKEN` | · | + | S | ≥16 chars enables khora-server `/v1/ops/*` and `/v1/host/registry*` (Bearer). Alias: `ADMIN_ROOT_TOKEN`. |
| `REGISTRY_BOOTSTRAP_EMAILS` | + | · | C | Comma-separated emails granted `staff` role on first login. |
| `KHORA_AUTH_MD_URL` | + | · | C | Markdown URL for Better Auth device verification (default `https://khoralabs.com/auth.md`). |
| `KHORA_SECURE_COOKIES` | + | · | C | Force Secure session cookies (`1`/`true`; default on when `REGISTRY_URL` is https). |
| `REGISTRY_HOST_HEALTH_POLL_INTERVAL_MS` | + | · | C | Background host health poll interval (default 60000). |
| `REGISTRY_HOST_HEALTH_PROBE_TIMEOUT_MS` | + | · | C | Per-host health probe timeout (default 5000). |
| `REGISTRY_HOST_HEALTH_POLL_DISABLED` | + | · | C | Set `1` to disable background health polling. |

### Email (AWS SES)

| Variable | R | K | Kind | Notes |
| --- | --- | --- | --- | --- |
| `SES_FROM_ADDRESS` | + | · | C | Verified SES sender for OTP emails. |
| `AWS_REGION` | + | + | C | SES + Litestream region. |
| `AWS_ACCESS_KEY_ID` | + | + | S | See shared group. |
| `AWS_SECRET_ACCESS_KEY` | + | + | S | See shared group. |
| `REGISTRY_AUTH_OTP_LOG` | + | · | C | Dev only: log OTP to stdout instead of SES. |

### Khora persistence

| Variable | R | K | Kind | Notes |
| --- | --- | --- | --- | --- |
| `REGISTRY_DATABASE_PATH` | + | · | C | Default `./data/registry.sqlite`. Use Render disk mount path in prod. |
| `KHORA_DATA_DIR` | · | + | C | Host persistence root (default `./data`). Derives host/auth/percolator DBs, cells, host memories (`memories/` service dataDir; id `{ kind: "host", ownerKey: "khora" }`). Do **not** set removed `KHORA_MEMORIES_DB_PATH`. |
| `KHORA_MEMORIES` | · | + | C | `1` / unset = host memories search index on (default); `0` / `off` = disabled (`/v1/search` 503). |
| `KHORA_MEMORIES_NAMESPACE_ROOT` | · | + | C | Host-owned namespace root for host memories (default `global`). |
| `KHORA_COLONNADE_CELL_WORKERS` | · | + | C | Bun Workers for cell SQLite (default on). |

### OpenTelemetry (apps → collector)

Apps export OTLP HTTP to a collector. Registry and khora-server are instrumented. **`bun run start`** applies defaults via start scripts (`OTEL_SERVICE_NAME`, `service.namespace`).

| Variable | R | K | Kind | Notes |
| --- | --- | --- | --- | --- |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | + | + | C | OTLP HTTP base URL (no path). Local: `http://127.0.0.1:4318`. Prod: collector private URL. When unset, SDK runs with no-op exporters. |
| `OTEL_SERVICE_NAME` | + | + | C | Resource `service.name`. Registry default `khora-registry`; khora-server default `khora-server`. Start scripts set when unset. |
| `OTEL_SERVICE_VERSION` | + | + | C | Resource `service.version` (default `0.1.0`). |
| `OTEL_RESOURCE_ATTRIBUTES` | + | + | C | Comma-separated `key=value` pairs. Start scripts default `service.namespace=khoralabs` when unset. Example: `deployment.environment=production`. |

### Encryption at rest

| Variable | R | K | Kind | Notes |
| --- | --- | --- | --- | --- |
| `KHORA_SQLCIPHER_KEY` | · | + | S | **Optional.** When set (≥16 chars), SQLCipher for host, cells, memories SQLite. Omit for plaintext local DBs. Same key required for Litestream restore of encrypted files. |
| `KHORA_OUTBOX_ENCRYPTION_KEY` | · | + | S | **Required.** AES-256-GCM field key for post `outbox.payload` (64-char hex or ≥32 UTF-8 bytes). Separate from SQLCipher. |
| `REGISTRY_SQLCIPHER_KEY` | + | · | S | **Required.** SQLCipher key for `registry.sqlite`. |

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

| Variable | R | K | Kind | Notes |
| --- | --- | --- | --- | --- |
| `KHORA_INVITE_REQUIRED` | · | + | C | Set `1` to require invite token on registration. |
| `KHORA_INVITES_PER_REGISTRATION` | · | + | C | Max invites per registration (default 10). |
| `KHORA_INVITE_SEED_TOKENS` | · | + | S | Bootstrap plaintext tokens (hashed at startup). |

### Litestream → S3

| Variable | R | K | Kind | Notes |
| --- | --- | --- | --- | --- |
| `REGISTRY_LITESTREAM` | + | · | C | `1` enables Litestream sidecar on registry. |
| `KHORA_LITESTREAM` | · | + | C | `1` enables Litestream sidecar on khora-server. |
| `LITESTREAM_S3_BUCKET` | + | + | C | Shared bucket name. |
| `LITESTREAM_S3_REGION` | + | + | C | Bucket region. |
| `LITESTREAM_S3_KEY_PREFIX` | + | + | C | **Different per service:** `registry/litestream`, `khora/litestream`. |
| `LITESTREAM_LOG_LEVEL` | + | + | C | `debug`, `info` (default), `warn`, or `error`. Use `error` in prod to reduce noise. |
| `LITESTREAM_S3_ENDPOINT` | · | · | C | **Local MinIO only.** Omit in prod AWS. |
| `LITESTREAM_ACCESS_KEY_ID` | · | · | S | MinIO dev only; prod uses `AWS_ACCESS_KEY_ID`. |
| `LITESTREAM_SECRET_ACCESS_KEY` | · | · | S | MinIO dev only; prod uses `AWS_SECRET_ACCESS_KEY`. |

---

## Suggested Render environment groups

### `khora-prod-shared` (secrets + AWS)

Link to **khora-server** and **registry**.

```
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
LITESTREAM_S3_BUCKET=khora-backups-prod
LITESTREAM_S3_REGION=us-east-1
KHORA_INVITE_PEPPER=...
KHORA_SQLCIPHER_KEY=...
KHORA_OUTBOX_ENCRYPTION_KEY=...
REGISTRY_SQLCIPHER_KEY=...
```

### Per-service overrides

**registry**

```
PORT=4000
REGISTRY_URL=https://r.khoralabs.com
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
LOG_LEVEL=info
OTEL_EXPORTER_OTLP_ENDPOINT=http://otel-collector:4318
OTEL_SERVICE_NAME=khora-registry
OTEL_RESOURCE_ATTRIBUTES=deployment.environment=production
```

**khora-server**

```
PORT=8788
KHORA_DATA_DIR=/data
# KHORA_MEMORIES=0   # omit for default (search index on)
KHORA_INVITE_PEPPER=...          # same as shared group
KHORA_LITESTREAM=1
LITESTREAM_S3_KEY_PREFIX=khora/litestream
KHORA_SQLCIPHER_KEY=...
KHORA_OUTBOX_ENCRYPTION_KEY=...
KHORA_CONSOLE_ROOT_TOKEN=...
LOG_LEVEL=info
OTEL_EXPORTER_OTLP_ENDPOINT=http://otel-collector:4318
OTEL_SERVICE_NAME=khora-server
OTEL_RESOURCE_ATTRIBUTES=deployment.environment=production
```


---

## Generating secrets

```bash
openssl rand -base64 32
```

Use for `BETTER_AUTH_SECRET`, `KHORA_INVITE_PEPPER`, `*_CONSOLE_ROOT_TOKEN`.

---

## Source `.env.example` files

| App | Path |
| --- | --- |
| Registry | `apps/registry/.env.example` |
| Khora server | `apps/server/.env.example` |

Litestream shared logic: `scripts/litestream/config.ts`.
