import type { Logger } from "pino";
import pino from "pino";
import { LOGGER_NAME } from "./payloads.ts";

let cachedLogger: Logger | undefined;

function buildLogger(): Logger {
  const level = (process.env.LOG_LEVEL ?? "info").toLowerCase();
  const dest = process.env.LOG_DESTINATION?.trim();
  const opts = { name: LOGGER_NAME, level };
  if (!dest) {
    return pino(opts);
  }
  return pino(
    opts,
    pino.multistream([
      { level, stream: process.stdout },
      { level, stream: pino.destination({ dest, sync: true }) },
    ]),
  );
}

function getLibrarianLogger(): Logger {
  if (cachedLogger === undefined) {
    cachedLogger = buildLogger();
  }
  return cachedLogger;
}

function createLoggerProxy(): Logger {
  return new Proxy({} as Logger, {
    get(_target, prop: string | symbol, _receiver) {
      const instance = getLibrarianLogger();
      const value = Reflect.get(instance, prop, instance) as unknown;
      return typeof value === "function"
        ? (value as (...args: unknown[]) => unknown).bind(instance)
        : value;
    },
  });
}

/** Reset cached instance (tests). Next log access rebuilds from current env. */
export function resetLibrarianLoggerForTests(): void {
  cachedLogger = undefined;
}

/**
 * Structured logs for `@cfd/librarian`. Set **`LOG_LEVEL`**, optional **`LOG_DESTINATION`**
 * (file path: duplicate JSON lines to stdout + NDJSON file, `sync: true` on file).
 * Use {@link librarianLog} from `./payloads.js` for typed payloads.
 */
export const logger = createLoggerProxy();
