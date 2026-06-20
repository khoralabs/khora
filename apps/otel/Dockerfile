# OpenTelemetry Collector for Khora services (see apps/otel/README.md).
# Base image is distroless (no /bin/sh) — do not RUN or use shell entrypoints.
# Prod (Grafana): default CMD uses config.grafana.yaml; set GRAFANA_CLOUD_* on Render.
# Local debug: override CMD — see README.md.
FROM otel/opentelemetry-collector-contrib:0.147.0

COPY apps/otel/otel-collector-config.yaml /etc/otelcol-contrib/config.yaml
COPY apps/otel/otel-collector-config.grafana.yaml /etc/otelcol-contrib/config.grafana.yaml

EXPOSE 4318 4317 13133

CMD ["--config=/etc/otelcol-contrib/config.grafana.yaml"]
