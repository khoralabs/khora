import { initOtel } from "@khoralabs/observability/otel";
import { buildOtelServerEnv } from "@khoralabs/observability/otel-env";

const otelEnv = buildOtelServerEnv({ defaultServiceName: "khora-server" });
for (const [key, value] of Object.entries(otelEnv)) {
  process.env[key] = value;
}

export const { tracer, meter } = initOtel({ serviceName: "khora-server" });
