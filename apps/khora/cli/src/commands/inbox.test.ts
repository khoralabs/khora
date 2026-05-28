import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  isProcessAlive,
  readKhoraDaemonControlFile,
  writeKhoraDaemonControlFile,
} from "@khoralabs/khora-daemon/control-pid";

import { handleInboxStatus, handleInboxStop } from "./inbox.ts";

describe("inbox stop/status", () => {
  test("status reports none without pid file", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "khora-inbox-cli-"));
    const flags = { "data-dir": dir };
    expect(() => handleInboxStatus(flags)).not.toThrow();
    rmSync(dir, { recursive: true, force: true });
  });

  test("stop clears stale pid file", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "khora-inbox-cli-"));
    mkdirSync(dir, { recursive: true });
    writeKhoraDaemonControlFile(dir, {
      pid: 999_999_999,
      did: "did:key:x",
      baseUrl: "http://127.0.0.1:8787",
      startedAtMs: Date.now(),
    });
    expect(isProcessAlive(999_999_999)).toBe(false);
    handleInboxStop({ "data-dir": dir });
    expect(readKhoraDaemonControlFile(dir)).toBeUndefined();
    rmSync(dir, { recursive: true, force: true });
  });
});
