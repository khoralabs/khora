import pino from "pino";

export const logger = pino(
  { level: process.env.LOG_LEVEL ?? "info", name: "atrium-server" },
  pino.destination(2),
);
