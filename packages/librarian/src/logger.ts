import pino from "pino";

const level = (process.env.LOG_LEVEL ?? "info").toLowerCase();

/** Structured logs for `@cfd/librarian`. Set `LOG_LEVEL` (`trace`…`fatal`, default `info`). */
export const logger = pino({
  name: "librarian",
  level,
});
