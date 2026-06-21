import { createLogger } from "@khoralabs/observability/logger";

export const logger = createLogger({ name: "exedra" });

export function childLogger(bindings: Record<string, unknown>) {
  return logger.child(bindings);
}
