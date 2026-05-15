import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { runStatusWith, type StatusCommandIo } from "./status.ts";

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(path.join(tmpdir(), "atrium-status-"));
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

class TestExit extends Error {
  constructor(public code: number) {
    super(`exit ${code}`);
  }
}

function makeIo(): { lines: string[]; io: StatusCommandIo; exitCodes: number[] } {
  const lines: string[] = [];
  const exitCodes: number[] = [];
  const io: StatusCommandIo = {
    log: (l) => lines.push(l),
    exit: (c) => {
      exitCodes.push(c);
      throw new TestExit(c);
    },
  };
  return { lines, io, exitCodes };
}

describe("runStatusWith", () => {
  test("not-running inbox: table + message, exit 0", () => {
    const { lines, io, exitCodes } = makeIo();
    runStatusWith({}, { dataDir: tmpDir }, io);
    expect(lines.some((l) => l.includes("inbox"))).toBe(true);
    expect(lines.some((l) => l.includes("not-running"))).toBe(true);
    expect(lines.some((l) => l.includes("No Atrium daemons running."))).toBe(true);
    expect(exitCodes).toEqual([]);
  });

  test("running inbox: no exit", () => {
    writeFileSync(path.join(tmpDir, "daemon.pid"), `${process.ppid}\n`);
    const { lines, io, exitCodes } = makeIo();
    runStatusWith({}, { dataDir: tmpDir }, io);
    const row = lines.find((l) => l.startsWith("inbox\t"));
    expect(row?.split("\t")[1]).toBe(String(process.ppid));
    expect(row?.split("\t")[2]).toBe("running");
    expect(row?.split("\t")).toHaveLength(5);
    expect(exitCodes).toEqual([]);
  });

  test("stale inbox: exit 2", () => {
    writeFileSync(path.join(tmpDir, "daemon.pid"), "999999999\n");
    const { lines, io, exitCodes } = makeIo();
    expect(() => runStatusWith({}, { dataDir: tmpDir }, io)).toThrow(TestExit);
    expect(lines.some((l) => l.includes("stale"))).toBe(true);
    expect(exitCodes).toEqual([2]);
  });

  test("--json mode emits aggregate object", () => {
    writeFileSync(path.join(tmpDir, "daemon.pid"), `${process.ppid}\n`);
    const { lines, io } = makeIo();
    runStatusWith({ json: true }, { dataDir: tmpDir }, io);
    const parsed = JSON.parse(lines.join("\n")) as {
      entries: unknown[];
      hasRunning: boolean;
      hasStale: boolean;
    };
    expect(parsed.hasRunning).toBe(true);
    expect(parsed.hasStale).toBe(false);
    expect(Array.isArray(parsed.entries)).toBe(true);
  });
});
