import pino from "pino";

export type Logger = pino.Logger;

export function createLogger(opts: { name: string; level?: string }): pino.Logger {
  return pino(
    { level: opts.level ?? process.env.LOG_LEVEL ?? "info", name: opts.name },
    pino.destination(2),
  );
}
