import pino from "pino";

const level = (process.env.LOG_LEVEL ?? "info").toLowerCase();

function usePrettyTransport(): boolean {
  if (process.env.LOG_PRETTY === "0" || process.env.LOG_PRETTY === "false") return false;
  if (process.env.LOG_PRETTY === "1" || process.env.LOG_PRETTY === "true") return true;
  return typeof process.stdout !== "undefined" && process.stdout.isTTY === true;
}

/**
 * CLI logger: JSON to stdout by default; `pino-pretty` when `LOG_PRETTY` is true or stdout is a TTY.
 * Set `LOG_LEVEL` (`trace`…`fatal`, default `info`). Disable pretty: `LOG_PRETTY=0`.
 */
export const logger = usePrettyTransport()
  ? pino({
      level,
      name: "cli",
      transport: {
        target: "pino-pretty",
        options: { colorize: true, translateTime: "SYS:HH:MM:ss.l" },
      },
    })
  : pino({ level, name: "cli" });

/** High-resolution elapsed milliseconds since `performance.now()` mark `start`. */
export function elapsedMs(start: number): number {
  return Math.round((performance.now() - start) * 100) / 100;
}
