# Production environment matrix

Reference for deploying the four Khora web services (Render or similar). Per-app `.env.example` files hold local dev defaults; this doc is the **prod wiring map**.

## Services

| Service | Package | Default port | Start command (prod) | Persistent disk |
| --- | --- | --- | --- | --- |
| Khora Labs homepage | `@khoralabs/khoralabs-homepage` | 3000 | `bun run start` | No |
| Exedra | `@khoralabs/exedra` | 3000 | `bun run start` | Yes (`exedra.db`, `memories/`) — planned |
| Khora registry | `@khoralabs/khora-registry` | 4000 | `bun run start` | Yes (`registry.sqlite`) |
| Khora server | `@khoralabs/khora-server` | 8788 | `bun run start` | Yes (catalog, frames, cells) |

Use `bun run start` (not bare `src/index.ts`) on **registry** and **khora-server** so Litestream sidecars run when enabled.

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

### URL consistency

| Concept | Set on | Example prod value |
| --- | --- | --- |
| Registry public URL | registry (`REGISTRY_URL`), khoralabs homepage + Exedra (`BUN_PUBLIC_KHORA_REGISTRY_URL`), Exedra server (`REGISTRY_URL`) | `https://registry.khoralabs.com` |
| Exedra public URL | Render service URL; register as registry trusted origin | `https://exedra.khoralabs.com` |
| Khora server public URL | host registry (`POST /v1/hosts/register` + activate), khora-server (`KHORA_PUBLIC_BASE_URL`) | `https://api.khora.khoralabs.com` |
| Browser origins for registry APIs | Host admin or registry admin → register explicit trusted origins; enable registry participation | e.g. `https://k-0.khoralabs.com`, `https://khoralabs.com`, `https://exedra.khoralabs.com` |

Each active host with registry participation enabled contributes its registered **trusted origins** to registry CORS and Better Auth `trustedOrigins`. Host `baseUrl` is not trusted unless explicitly listed (or included via `KHORA_REGISTRY_TRUST_BASE_URL_ORIGIN` on the host).

Registry operators configure host registration trust via `REGISTRY_REGISTRATION_TRUST` (`manual` | `health` | `open`). Self-hosters complete registration and origin setup from the host admin at `/admin/registry`.

---

## Variable matrix

Columns: **R** registry · **K** khora-server · **KH** khoralabs homepage · **E** exedra

Legend: **+** = set on this service · **·** = not used · **Kind:** **S** = secret · **C** = config

### HTTP & runtime

| Variable | R | K | KH | E | Kind | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| `PORT` | + | + | + | + | C | Render sets automatically; override if needed. |
| `NODE_ENV` | · | · | + | + | C | `production` for prod builds. |

### URLs & CORS

| Variable | R | K | KH | E | Kind | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| `REGISTRY_URL` | + | · | · | + | C | Registry: public base URL for Better Auth (`BETTER_AUTH_URL` alias). Exedra: registry base for server-side `verifyRegistrySession` (forwards browser cookies). |
| `REGISTRY_COOKIE_DOMAIN` | + | · | · | · | C | Optional, e.g. `.khoralabs.com` for cross-subdomain cookies (homepage + Exedra OTP on registry). |
| `KHORA_REGISTRY_URL` | · | + | · | · | C | khora-server well-known + opt-in; CLI default. |
| `BUN_PUBLIC_KHORA_REGISTRY_URL` | · | · | + | + | C | Registry URL for browser OTP (`EmailConfirm` / Better Auth client). Set at build time on platforms that split build/runtime. |
| `KHORA_HOST_SLUG` | · | + | · | · | C | Host slug for `/.well-known/khora` and registry opt-in. |
| `KHORA_PUBLIC_BASE_URL` | · | + | · | · | C | Public base URL in well-known + register body (default loopback + `PORT`). |
| `KHORA_REGISTRY_PARTICIPATE` | · | + | · | · | C | Legacy: `1`/`true` registers with registry on boot when slug set via env. Prefer `/admin/registry`. |
| `KHORA_REGISTRY_TRUST_BASE_URL_ORIGIN` | · | + | · | · | C | When syncing, include `KHORA_PUBLIC_BASE_URL` origin in trusted origins. |
| `REGISTRY_REGISTRATION_TRUST` | + | · | · | · | C | `manual` (default), `health`, or `open` — controls auto-activation policy for self-serve host registration. |
| `REGISTRY_REGISTRATION_REQUIREMENTS` | + | · | · | · | C | Optional JSON override of registration requirement IDs (extensibility hook). |
| `KHORA_HOST_DISPLAY_NAME` | · | + | · | · | C | Optional display name for registry register body. |

### Khora CLI (developer machine, not a deployed service)

| Variable | Notes |
| --- | --- |
| `KHORA_REGISTRY_URL` | Registry for `khora host list` / `khora link` (default `http://localhost:4000`). Also set in `~/.khora/cli.config.json` or `--registry-url`. |

Host selection: `khora host use <slug>` writes `currentHost` and `hosts` to `cli.config.json`; override per command with `--host=<slug>`. Registry session after `khora link` is stored in `~/.khora/registry-session` (not env or config).

### Auth & secrets

| Variable | R | K | KH | E | Kind | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| `BETTER_AUTH_SECRET` | + | · | · | · | S | ≥32 chars. Registry human auth (OTP). |
| `KHORA_INVITE_PEPPER` | · | + | · | · | S | khora-server only; local invite mint + validation. |
| `REGISTRY_CONSOLE_ROOT_TOKEN` | + | · | · | · | S | ≥16 chars enables `/admin` operator console. |
| `KHORA_CONSOLE_ROOT_TOKEN` | · | + | · | · | S | ≥16 chars enables khora-server `/admin`. |
| `REGISTRY_BOOTSTRAP_EMAILS` | + | · | · | · | C | Comma-separated emails granted `staff` role on first login. |

### Email (AWS SES)

| Variable | R | K | KH | E | Kind | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| `SES_FROM_ADDRESS` | + | · | · | · | C | Verified SES sender for OTP emails. |
| `AWS_REGION` | + | + | · | · | C | SES + Litestream region. |
| `AWS_ACCESS_KEY_ID` | + | + | · | · | S | See shared group. |
| `AWS_SECRET_ACCESS_KEY` | + | + | · | · | S | See shared group. |
| `REGISTRY_AUTH_OTP_LOG` | + | · | · | · | C | Dev only: log OTP to stdout instead of SES. |

### Khora persistence

| Variable | R | K | KH | E | Kind | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| `REGISTRY_DATABASE_PATH` | + | · | · | · | C | Default `./data/registry.sqlite`. Use Render disk mount path in prod. |
| `KHORA_DATA_DIR` | · | + | · | · | C | Host persistence root (default `./data`). Derives catalog, frames, cells, memories paths. |
| `KHORA_MEMORIES` | · | + | · | · | C | `1` / unset = search index on (default); `0` / `off` = disabled (`/v1/search` 503). |
| `KHORA_CELL_POOL_COUNT` | · | + | · | · | C | Shard pool size (default 16). |
| `KHORA_COLONNADE_CELL_WORKERS` | · | + | · | · | C | Bun Workers for cell SQLite (default on). |
| `LOG_LEVEL` | · | + | + | · | C | Pino level (default `info`). |

### Encryption at rest

| Variable | R | K | KH | E | Kind | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| `KHORA_SQLCIPHER_KEY` | · | + | · | · | S | **Required.** SQLCipher key for catalog, frames, cells, memories SQLite (≥16 chars). Same key required for Litestream restore. |
| `KHORA_OUTBOX_ENCRYPTION_KEY` | · | + | · | · | S | **Required.** AES-256-GCM field key for post `outbox.payload` (64-char hex or ≥32 UTF-8 bytes). Separate from SQLCipher. |
| `REGISTRY_SQLCIPHER_KEY` | + | · | · | · | S | **Required.** SQLCipher key for `registry.sqlite`. |

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

| Variable | R | K | KH | E | Kind | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| `KHORA_INVITE_REQUIRED` | · | + | · | · | C | Set `1` to require invite token on registration. |
| `KHORA_INVITES_PER_REGISTRATION` | · | + | · | · | C | Max invites per registration (default 10). |
| `KHORA_INVITE_SEED_TOKENS` | · | + | · | · | S | Bootstrap plaintext tokens (hashed at startup). |

### Litestream → S3

| Variable | R | K | KH | E | Kind | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| `REGISTRY_LITESTREAM` | + | · | · | · | C | `1` enables Litestream sidecar on registry. |
| `KHORA_LITESTREAM` | · | + | · | · | C | `1` enables Litestream sidecar on khora-server. |
| `EXEDRA_LITESTREAM` | · | · | · | + | C | **Planned.** `1` enables Litestream sidecar on Exedra (`exedra.db` + `memories/`). |
| `LITESTREAM_S3_BUCKET` | + | + | · | + | C | Shared bucket name. |
| `LITESTREAM_S3_REGION` | + | + | · | + | C | Bucket region. |
| `LITESTREAM_S3_KEY_PREFIX` | + | + | · | + | C | **Different per service:** `registry/litestream`, `khora/litestream`, `exedra/litestream`. |
| `LITESTREAM_LOG_LEVEL` | + | + | · | + | C | `debug`, `info` (default), `warn`, or `error`. Use `error` in prod to reduce noise. |
| `LITESTREAM_S3_ENDPOINT` | · | · | · | · | C | **Local MinIO only.** Omit in prod AWS. |
| `LITESTREAM_ACCESS_KEY_ID` | · | · | · | · | S | MinIO dev only; prod uses `AWS_ACCESS_KEY_ID`. |
| `LITESTREAM_SECRET_ACCESS_KEY` | · | · | · | · | S | MinIO dev only; prod uses `AWS_SECRET_ACCESS_KEY`. |

### Contact form & Slack (khoralabs homepage)

| Variable | R | K | KH | E | Kind | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| `SLACK_BOT_TOKEN` | · | · | + | · | S | Slack app bot token (`xoxb-...`) with `chat:write`. Posts contact form submissions via `chat.postMessage`. |
| `SLACK_CONTACT_CHANNEL_ID` | · | · | + | · | C | Target channel ID (e.g. `C0123456789`). Invite the bot to this channel. |
| `CONTACT_QUEUE_TTL_SECONDS` | · | · | + | · | C | Seconds to wait for OTP before sending an **Unconfirmed** Slack message (default `300`; matches Better Auth `expiresIn` on registry). |

Contact flow: submission is queued when the user reaches the OTP step; Slack sends **Verified** immediately on OTP confirm, or **Unconfirmed** when this TTL expires. Includes marketing opt-in status in the Slack payload. Server logs (`contact.queued`, `contact.slack_sent`) never include email or message body.

### Exedra app

| Variable | R | K | KH | E | Kind | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| `EXEDRA_DATA_DIR` | · | · | · | + | C | SQLite root (default `./data`; holds `exedra.db`, `memories/`). |
| `INVITE_PEPPER` | · | · | · | + | S | **Required.** HMAC pepper for single-use session invite tokens. |
| `EXEDRA_IDENTITY_KEY` | · | · | · | + | S | **Required.** 32-byte hex AES key for custodial `did:key` identity blobs in `users.identity_encrypted`. |
| `EXEDRA_MEMORIES_SQLCIPHER_KEY` | · | · | · | + | S | **Required.** SQLCipher key for `memories/{orgId}.db` and encoded user DB files. |
| `SQLITE_CUSTOM_LIB` | · | · | · | + | C | Optional path to Homebrew/custom sqlite for sqlite-vec (memories extensions). |
| `AI_API_KEY` | · | · | · | + | S | OpenAI (or compatible) API key for interview agent. |
| `AI_MODEL` | · | · | · | + | C | Model id (default `gpt-4o`). |
| `AI_BASE_URL` | · | · | · | + | C | Optional OpenAI-compatible base URL. |
| `EXEDRA_STUB_REGISTRY` | · | · | · | + | C | `1` mounts in-process Better Auth–compatible stub at `/api/auth/*` (local dev only). |
| `BUN_PUBLIC_EXEDRA_STUB_REGISTRY` | · | · | · | + | C | `1` — browser uses same origin for OTP (pair with `EXEDRA_STUB_REGISTRY`). |
| `EXEDRA_STUB_REGISTRY_OTP` | · | · | · | + | C | Fixed OTP for stub sign-in (default `000000`). |

---

## Suggested Render environment groups

### `khora-prod-shared` (secrets + AWS)

Link to **khora-server** (and registry for AWS/Litestream only).

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
KHORA_LITESTREAM=1
LITESTREAM_S3_KEY_PREFIX=khora/litestream
KHORA_SQLCIPHER_KEY=...
KHORA_OUTBOX_ENCRYPTION_KEY=...
KHORA_CONSOLE_ROOT_TOKEN=...
```

**khoralabs homepage**

```
PORT=3000
NODE_ENV=production
BUN_PUBLIC_KHORA_REGISTRY_URL=https://registry.example.com
LOG_LEVEL=info
SLACK_BOT_TOKEN=xoxb-...
SLACK_CONTACT_CHANNEL_ID=C0123456789
CONTACT_QUEUE_TTL_SECONDS=300
```

**exedra (local stub — single process, no registry app)**

```
EXEDRA_STUB_REGISTRY=1
BUN_PUBLIC_EXEDRA_STUB_REGISTRY=1
# EXEDRA_STUB_REGISTRY_OTP=000000
INVITE_PEPPER=<openssl rand -hex 32>
EXEDRA_IDENTITY_KEY=<openssl rand -hex 32>
EXEDRA_MEMORIES_SQLCIPHER_KEY=<openssl rand -base64 32>
AI_API_KEY=sk-...
```

**exedra (production — separate registry)**

```
PORT=3000
NODE_ENV=production
BUN_PUBLIC_KHORA_REGISTRY_URL=https://registry.example.com
REGISTRY_URL=https://registry.example.com
EXEDRA_DATA_DIR=/var/data/exedra
INVITE_PEPPER=<openssl rand -hex 32>
EXEDRA_IDENTITY_KEY=<openssl rand -hex 32>
EXEDRA_MEMORIES_SQLCIPHER_KEY=<openssl rand -base64 32>
AI_API_KEY=sk-...
AI_MODEL=gpt-4o
# EXEDRA_LITESTREAM=1                    # planned
# LITESTREAM_S3_KEY_PREFIX=exedra/litestream
```

Register Exedra's public origin (e.g. `https://exedra.example.com`) as a registry **trusted origin** so browser OTP and `/api/auth/session` cookie forwarding work cross-origin. Set `REGISTRY_COOKIE_DOMAIN=.example.com` on registry when Exedra and registry share a parent domain.

Set `BUN_PUBLIC_*` at **build time** if the platform separates build from runtime (Render: set on the service before deploy). `SLACK_BOT_TOKEN` is server-only (never `BUN_PUBLIC_*`).

---

## Generating secrets

```bash
openssl rand -base64 32
```

Use for `BETTER_AUTH_SECRET`, `KHORA_INVITE_PEPPER`, `INVITE_PEPPER`, `EXEDRA_IDENTITY_KEY`, `*_CONSOLE_ROOT_TOKEN`.

---

## Source `.env.example` files

| App | Path |
| --- | --- |
| Registry | `apps/khoralabs/registry/.env.example` |
| Khora server | `apps/khora/server/.env.example` |
| Khora Labs homepage | `apps/khoralabs/homepage/.env.example` |
| Exedra | `apps/exedra/.env.example` |

Litestream shared logic: `scripts/litestream-config.ts`. Local MinIO: `apps/s3/README.md`.
