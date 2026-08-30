import { createLogger, type Logger } from "@khoralabs/observability/logger";

export const logger: Logger = createLogger({ name: "khora-server-http" });
