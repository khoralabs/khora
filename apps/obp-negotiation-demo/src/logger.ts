import pino from "pino";

const level = (process.env.LOG_LEVEL ?? "info").toLowerCase();

/** JSONL file logger for a single negotiation run. */
export function createRunLogger(destPath: string): pino.Logger {
  return pino(
    { name: "obp-negotiation-demo", level },
    pino.destination({ dest: destPath, sync: true }),
  );
}
