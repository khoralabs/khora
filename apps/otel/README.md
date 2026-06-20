# OpenTelemetry Collector for Khora services

Receives OTLP from Exedra, registry, khora-server, etc. and either:

- **Local dev** — prints telemetry to container stdout (`debug` exporter)
- **Grafana Cloud** — forwards when `GRAFANA_CLOUD_*` env vars are set

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
| `GRAFANA_CLOUD_OTLP_ENDPOINT` | `apps/otel/.env` (collector only) |
| `GRAFANA_CLOUD_INSTANCE_ID` | `apps/otel/.env` (collector only) |
| `GRAFANA_CLOUD_API_KEY` | `apps/otel/.env` (collector only) |

**Do not** put the Grafana API key in Exedra, registry, or khora-server env. Apps only need:

```env
OTEL_EXPORTER_OTLP_ENDPOINT=http://127.0.0.1:4318
OTEL_SERVICE_NAME=exedra
```

The collector adds Grafana auth on export. `entrypoint.sh` computes `GRAFANA_CLOUD_BASIC_AUTH_HEADER` for collector self-telemetry (same as Grafana’s Linux onboarding guide).

## Build

Use the **repository root** as the build context (same as `apps/redis` and `apps/s3`):

```sh
docker build -t khora-otel-collector -f apps/otel/Dockerfile .
```

## Run (Grafana Cloud)

```sh
docker run -d --name khora-otel-collector \
  --env-file apps/otel/.env \
  -p 4318:4318 \
  -p 4317:4317 \
  -p 13133:13133 \
  khora-otel-collector
```

## Run (local debug only)

Omit Grafana env vars — collector uses the `debug` exporter:

```sh
docker run -d --name khora-otel-collector \
  -p 4318:4318 \
  khora-otel-collector
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

Run the collector as a **Private Service**. Put `GRAFANA_CLOUD_*` in a Render secret env group on the collector service only. Other services set `OTEL_EXPORTER_OTLP_ENDPOINT` to the collector’s internal URL.
