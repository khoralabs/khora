import { initOtel } from "@khoralabs/observability/otel";

export const { tracer, meter } = initOtel({ serviceName: "exedra-process-document" });
