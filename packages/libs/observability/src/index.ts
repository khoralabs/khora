export { createLogger, type Logger } from "./logger.js";
export { type InitOtelOptions, initOtel, type OtelHandles } from "./otel.js";
export {
  buildOtelResourceAttributes,
  buildOtelServerEnv,
  DEFAULT_SERVICE_NAMESPACE,
  formatOtelResourceAttributes,
  mergeOtelResourceAttributes,
  parseOtelResourceAttributes,
} from "./otel-env.js";
export { startChildSpan, withSpan } from "./spans.js";
