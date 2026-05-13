import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { listRegisteredDaemons } from "./daemon-registry.ts";
import { encodeRoomIdForPath } from "./room-daemon-pid.ts";

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

  test("room pid picked up with meta roomId", () => {
    const roomDir = path.join(tmpDir, "daemons", "rooms");
    mkdirSync(roomDir, { recursive: true });
    const rid = "r1";
    const enc = encodeRoomIdForPath(rid);
    writeFileSync(path.join(roomDir, `${enc}.pid`), "12345\n");
    writeFileSync(
      path.join(roomDir, `${enc}.meta.json`),
      `${JSON.stringify({ kind: "room", roomId: rid })}\n`,
    );
    const rows = listRegisteredDaemons({ dataDir: tmpDir });
    const room = rows.find((r) => r.kind === "room");
    expect(room?.roomId).toBe(rid);
    expect(room?.pid).toBe(12345);
    expect(room?.state).toBe("stale");
  });
});
