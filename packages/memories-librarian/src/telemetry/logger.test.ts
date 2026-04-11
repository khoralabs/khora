import { afterEach, beforeEach, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { logger, resetLibrarianLoggerForTests } from "./logger.js";
import { librarianLog } from "./payloads.js";

let prevDest: string | undefined;
let tmpDir: string | undefined;

beforeEach(() => {
  prevDest = process.env.LOG_DESTINATION;
  tmpDir = mkdtempSync(join(tmpdir(), "librarian-log-"));
  resetLibrarianLoggerForTests();
});

afterEach(() => {
  if (prevDest !== undefined) {
    process.env.LOG_DESTINATION = prevDest;
  } else {
    delete process.env.LOG_DESTINATION;
  }
  resetLibrarianLoggerForTests();
  if (tmpDir) {
    rmSync(tmpDir, { recursive: true, force: true });
    tmpDir = undefined;
  }
});

test("logger without LOG_DESTINATION: structured info does not throw", () => {
  delete process.env.LOG_DESTINATION;
  resetLibrarianLoggerForTests();
  logger.info(librarianLog("librarian.test.probe", { processTimeMs: 1, ok: true }));
});

test("LOG_DESTINATION appends NDJSON line", () => {
  if (!tmpDir) throw new Error("tmpDir is not defined");

  const path = join(tmpDir, "out.jsonl");
  process.env.LOG_DESTINATION = path;
  resetLibrarianLoggerForTests();

  logger.info(librarianLog("librarian.test.probe", { processTimeMs: 2, ok: true }));

  const lines = readFileSync(path, "utf8").trim().split("\n").filter(Boolean);
  expect(lines.length).toBe(1);
  const row = JSON.parse(lines[0] ?? "{}") as {
    phase: string;
    ok: boolean;
    processTimeMs: number;
    name: string;
  };
  expect(row.phase).toBe("librarian.test.probe");
  expect(row.ok).toBe(true);
  expect(row.processTimeMs).toBe(2);
  expect(row.name).toBe("librarian");
});
