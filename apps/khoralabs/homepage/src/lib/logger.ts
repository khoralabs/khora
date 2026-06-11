import pino from "pino";

export const logger = pino({
  name: "homepage",
  level: process.env.LOG_LEVEL ?? "info",
});
