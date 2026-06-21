export {
  buildOtelResourceAttributes,
  buildOtelServerEnv as _buildOtelServerEnv,
  DEFAULT_SERVICE_NAMESPACE,
  formatOtelResourceAttributes,
  mergeOtelResourceAttributes,
  parseOtelResourceAttributes,
} from "@khoralabs/observability/otel-env";

import { buildOtelServerEnv as _build } from "@khoralabs/observability/otel-env";

export const DEFAULT_OTEL_SERVICE_NAME = "exedra";

/** Convenience wrapper — sets the default service name to "exedra". */
export function buildOtelServerEnv(env: NodeJS.ProcessEnv = process.env): Record<string, string> {
  return _build({ defaultServiceName: DEFAULT_OTEL_SERVICE_NAME }, env);
}
