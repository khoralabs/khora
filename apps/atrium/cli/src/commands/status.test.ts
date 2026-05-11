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
  test("not-running prints message and exits 3", () => {
    const { lines, io, exitCodes } = makeIo();
    expect(() => runStatusWith({}, { dataDir: tmpDir }, io)).toThrow(TestExit);
    expect(lines).toEqual(["not running"]);
    expect(exitCodes).toEqual([3]);
  });

  test("running prints pid + log path, no exit", () => {
    writeFileSync(path.join(tmpDir, "daemon.pid"), `${process.ppid}\n`);
    const { lines, io, exitCodes } = makeIo();
    runStatusWith({}, { dataDir: tmpDir }, io);
    expect(lines[0]).toContain(`running pid=${process.ppid}`);
    expect(lines[0]).toContain(path.join(tmpDir, "daemon.log"));
    expect(exitCodes).toEqual([]);
  });

  test("stale prints message and exits 2", () => {
    writeFileSync(path.join(tmpDir, "daemon.pid"), "999999999\n");
    const { lines, io, exitCodes } = makeIo();
    expect(() => runStatusWith({}, { dataDir: tmpDir }, io)).toThrow(TestExit);
    expect(lines[0]).toContain("stale pid=999999999");
    expect(exitCodes).toEqual([2]);
  });

  test("--json mode emits raw status object", () => {
    writeFileSync(path.join(tmpDir, "daemon.pid"), `${process.ppid}\n`);
    const { lines, io } = makeIo();
    runStatusWith({ json: true }, { dataDir: tmpDir }, io);
    const parsed = JSON.parse(lines[0] ?? "");
    expect(parsed.state).toBe("running");
    expect(parsed.pid).toBe(process.ppid);
  });
});
