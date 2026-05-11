import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  acquireDaemonLock,
  DaemonAlreadyRunningError,
  daemonLogPath,
  daemonPidPath,
  readDaemonStatus,
} from "./daemon-pid.ts";

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(path.join(tmpdir(), "atrium-pid-"));
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe("daemonPidPath / daemonLogPath", () => {
  test("uses dataDir when set", () => {
    expect(daemonPidPath({ dataDir: tmpDir })).toBe(path.join(tmpDir, "daemon.pid"));
    expect(daemonLogPath({ dataDir: tmpDir })).toBe(path.join(tmpDir, "daemon.log"));
  });

  test("log path override wins", () => {
    expect(daemonLogPath({ dataDir: tmpDir }, "/tmp/x.log")).toBe(path.resolve("/tmp/x.log"));
  });

  test("falls back to ~/.atrium when dataDir is empty", () => {
    expect(daemonPidPath({ dataDir: undefined })).toMatch(/\.atrium\/daemon\.pid$/);
    expect(daemonPidPath({ dataDir: "  " })).toMatch(/\.atrium\/daemon\.pid$/);
  });
});

describe("acquireDaemonLock / readDaemonStatus", () => {
  test("acquire writes the file with our pid; release deletes it", () => {
    const handle = acquireDaemonLock({ dataDir: tmpDir });
    expect(handle.pid).toBe(process.pid);
    const pidFile = daemonPidPath({ dataDir: tmpDir });
    expect(existsSync(pidFile)).toBe(true);
    expect(readFileSync(pidFile, "utf8").trim()).toBe(String(process.pid));
    handle.release();
    expect(existsSync(pidFile)).toBe(false);
  });

  test("second acquire while a real process holds the lock throws", () => {
    const pidFile = daemonPidPath({ dataDir: tmpDir });
    // ppid is alive for the duration of this test process; use it as a "foreign live pid".
    const livePid = process.ppid;
    writeFileSync(pidFile, `${livePid}\n`);
    try {
      acquireDaemonLock({ dataDir: tmpDir });
      expect(false).toBe(true);
    } catch (e) {
      expect(e).toBeInstanceOf(DaemonAlreadyRunningError);
      expect((e as DaemonAlreadyRunningError).pid).toBe(livePid);
    }
  });

  test("stale pid file is auto-cleaned and acquire succeeds", () => {
    const pidFile = daemonPidPath({ dataDir: tmpDir });
    writeFileSync(pidFile, "999999999\n");
    const handle = acquireDaemonLock({ dataDir: tmpDir });
    expect(handle.pid).toBe(process.pid);
    handle.release();
  });

  test("readDaemonStatus reflects state transitions", () => {
    const cfg = { dataDir: tmpDir };
    expect(readDaemonStatus(cfg).state).toBe("not-running");
    const handle = acquireDaemonLock(cfg);
    const live = readDaemonStatus(cfg);
    expect(live.state).toBe("running");
    if (live.state === "running") expect(live.pid).toBe(process.pid);
    handle.release();
    writeFileSync(daemonPidPath(cfg), "999999999\n");
    expect(readDaemonStatus(cfg).state).toBe("stale");
  });

  test("release is idempotent", () => {
    const handle = acquireDaemonLock({ dataDir: tmpDir });
    handle.release();
    handle.release();
  });

  test("release does not delete a pid file owned by another process", () => {
    const cfg = { dataDir: tmpDir };
    const handle = acquireDaemonLock(cfg);
    writeFileSync(daemonPidPath(cfg), "12345\n");
    handle.release();
    expect(existsSync(daemonPidPath(cfg))).toBe(true);
  });
});
