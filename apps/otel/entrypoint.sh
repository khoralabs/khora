#!/bin/sh
set -eu

export HOSTNAME="${HOSTNAME:-khora-otel-collector}"

if [ -n "${GRAFANA_CLOUD_API_KEY:-}" ] && [ -n "${GRAFANA_CLOUD_INSTANCE_ID:-}" ]; then
  export GRAFANA_CLOUD_BASIC_AUTH_HEADER="Basic $(printf '%s' "${GRAFANA_CLOUD_INSTANCE_ID}:${GRAFANA_CLOUD_API_KEY}" | base64 | tr -d '\n')"
  exec /otelcol-contrib --config=/etc/otelcol-contrib/config.grafana.yaml
fi

exec /otelcol-contrib --config=/etc/otelcol-contrib/config.yaml
