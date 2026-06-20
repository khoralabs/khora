import { metrics, trace } from "@opentelemetry/api";
import { OTLPLogExporter } from "@opentelemetry/exporter-logs-otlp-http";
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-http";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { PinoInstrumentation } from "@opentelemetry/instrumentation-pino";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { BatchLogRecordProcessor } from "@opentelemetry/sdk-logs";
import { PeriodicExportingMetricReader } from "@opentelemetry/sdk-metrics";
import { NodeSDK } from "@opentelemetry/sdk-node";

import { buildOtelResourceAttributes, DEFAULT_OTEL_SERVICE_NAME } from "./otel-config.js";

const otlpEndpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT?.trim().replace(/\/$/, "");
const otlpEnabled = otlpEndpoint !== undefined && otlpEndpoint.length > 0;
const serviceName = process.env.OTEL_SERVICE_NAME?.trim() || DEFAULT_OTEL_SERVICE_NAME;
const serviceVersion = process.env.OTEL_SERVICE_VERSION?.trim() || "0.1.0";

const resource = resourceFromAttributes(buildOtelResourceAttributes(serviceName, serviceVersion));

const pinoInstrumentation = new PinoInstrumentation({
  disableLogSending: !otlpEnabled,
});

const sdk = new NodeSDK({
  resource,
  instrumentations: [pinoInstrumentation],
  ...(otlpEnabled
    ? {
        traceExporter: new OTLPTraceExporter({ url: `${otlpEndpoint}/v1/traces` }),
        metricReader: new PeriodicExportingMetricReader({
          exporter: new OTLPMetricExporter({ url: `${otlpEndpoint}/v1/metrics` }),
        }),
        logRecordProcessors: [
          new BatchLogRecordProcessor(new OTLPLogExporter({ url: `${otlpEndpoint}/v1/logs` })),
        ],
      }
    : {}),
});

sdk.start();

process.on("SIGTERM", () => {
  void sdk.shutdown();
});

export const tracer = trace.getTracer("exedra");
export const meter = metrics.getMeter("exedra");
