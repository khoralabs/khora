import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { listRegisteredDaemons } from "./daemon-registry.ts";

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(path.join(tmpdir(), "atrium-reg-"));
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe("listRegisteredDaemons", () => {
  test("inbox not-running when no pid file", () => {
    const rows = listRegisteredDaemons({ dataDir: tmpDir });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.kind).toBe("inbox");
    expect(rows[0]?.state).toBe("not-running");
  });
});
