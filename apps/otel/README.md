# OpenTelemetry Collector for Khora services

Receives OTLP from Exedra, registry, khora-server, etc. and forwards to **Grafana Cloud** (default Docker CMD). For local stdout debugging, override the config path (see below).

The upstream image is **distroless** (no shell) — the Dockerfile only copies configs and sets `CMD`; no `RUN` or shell entrypoint.

## Grafana Cloud credentials

1. In Grafana Cloud: **Connections → OpenTelemetry** (or Cloud Portal → OpenTelemetry).
2. Copy **OTLP endpoint**, **Instance ID**, and **API key**.
3. Create `apps/otel/.env` from the example (gitignored):

```sh
cp apps/otel/.env.example apps/otel/.env
# edit apps/otel/.env — set GRAFANA_CLOUD_INSTANCE_ID and GRAFANA_CLOUD_API_KEY
```

| Variable | Where it goes |
| --- | --- |
| `GRAFANA_CLOUD_OTLP_ENDPOINT` | Collector service only (Render secrets or `apps/otel/.env`) |
| `GRAFANA_CLOUD_INSTANCE_ID` | Collector service only |
| `GRAFANA_CLOUD_API_KEY` | Collector service only |

**Do not** put the Grafana API key on Exedra, registry, or khora-server. Apps only need:

```env
OTEL_EXPORTER_OTLP_ENDPOINT=http://127.0.0.1:4318
OTEL_SERVICE_NAME=exedra
```

## Build

Use the **repository root** as the build context (same as `apps/redis` and `apps/s3`):

```sh
docker build -t khora-otel-collector -f apps/otel/Dockerfile .
```

## Run (Grafana Cloud — default)

```sh
docker run -d --name khora-otel-collector \
  --env-file apps/otel/.env \
  -p 4318:4318 \
  -p 4317:4317 \
  -p 13133:13133 \
  khora-otel-collector
```

Default `CMD` is `--config=/etc/otelcol-contrib/config.grafana.yaml`.

## Run (local debug only)

Override the config to use the `debug` exporter (no Grafana credentials):

```sh
docker run -d --name khora-otel-collector \
  -p 4318:4318 \
  khora-otel-collector \
  --config=/etc/otelcol-contrib/config.yaml
```

View debug output: `docker logs -f khora-otel-collector`

## Exedra

Point Exedra at the collector (not Grafana directly):

```env
OTEL_EXPORTER_OTLP_ENDPOINT=http://127.0.0.1:4318
OTEL_SERVICE_NAME=exedra
LOG_LEVEL=info
```

Pretty-print Exedra stdout separately:

```sh
bun --hot src/index.ts 2>&1 | bunx pino-pretty
```

In Grafana Cloud, filter by `service.name` (`exedra`, `khora-registry`, `khora-server`, …).

## Render (production)

Deploy as a **Private Service** from the **repo root**:

| Setting | Value |
| --- | --- |
| Root Directory | *(empty)* |
| Dockerfile Path | `apps/otel/Dockerfile` |

Set `GRAFANA_CLOUD_*` in a secret env group on the collector service only. Other services use the collector’s internal URL:

```env
OTEL_EXPORTER_OTLP_ENDPOINT=http://<collector-service-name>:4318
```

Health check (optional): `http://<host>:13133`
