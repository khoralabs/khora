# OpenTelemetry Collector for Khora services (see apps/otel/README.md).
# Local dev: debug exporter when Grafana env vars are unset.
# Grafana Cloud: set GRAFANA_CLOUD_* via --env-file apps/otel/.env
FROM otel/opentelemetry-collector-contrib:0.147.0

COPY apps/otel/otel-collector-config.yaml /etc/otelcol-contrib/config.yaml
COPY apps/otel/otel-collector-config.grafana.yaml /etc/otelcol-contrib/config.grafana.yaml
COPY apps/otel/entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

EXPOSE 4318 4317 13133

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
