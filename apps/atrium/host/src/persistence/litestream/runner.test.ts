import { chmodSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, test } from "bun:test";
import { restoreIfReplicaExists, startLitestreamReplicate } from "./runner.ts";

function writeFakeBin(contents: string): string {
  const dir = mkdtempSync(path.join(tmpdir(), "litestream-fake-"));
  const bin = path.join(dir, "litestream");
  writeFileSync(bin, contents);
  chmodSync(bin, 0o755);
  return bin;
}

const silentLogger = { log: () => {}, warn: () => {} };

describe("restoreIfReplicaExists", () => {
  test("resolves on exit code 0", async () => {
    const bin = writeFakeBin("#!/bin/sh\nexit 0\n");
    await restoreIfReplicaExists({
      binPath: bin,
      configPath: "/tmp/x.yml",
      dbPath: "/tmp/x.db",
      logger: silentLogger,
    });
    expect(true).toBe(true);
  });

  test("resolves (does not throw) on non-zero exit", async () => {
    const bin = writeFakeBin("#!/bin/sh\nexit 13\n");
    const warnings: string[] = [];
    await restoreIfReplicaExists({
      binPath: bin,
      configPath: "/tmp/x.yml",
      dbPath: "/tmp/x.db",
      logger: { log: () => {}, warn: (m) => warnings.push(String(m)) },
    });
    expect(warnings.some((m) => m.includes("exited 13"))).toBe(true);
  });
});

describe("startLitestreamReplicate", () => {
  test("stop() sends SIGTERM and awaits child exit", async () => {
    const bin = writeFakeBin(
      "#!/bin/sh\ntrap 'exit 0' TERM\nwhile true; do sleep 0.1; done\n",
    );
    const handle = startLitestreamReplicate({
      binPath: bin,
      configPath: "/tmp/x.yml",
      logger: silentLogger,
    });
    expect(handle.pid()).toBeGreaterThan(0);
    await handle.stop();
    expect(handle.pid()).toBeUndefined();
  });

  test("stop() is idempotent", async () => {
    const bin = writeFakeBin(
      "#!/bin/sh\ntrap 'exit 0' TERM\nwhile true; do sleep 0.1; done\n",
    );
    const handle = startLitestreamReplicate({
      binPath: bin,
      configPath: "/tmp/x.yml",
      logger: silentLogger,
    });
    await handle.stop();
    await expect(handle.stop()).resolves.toBeUndefined();
  });

  test("onExit fires when child dies before stop()", async () => {
    const bin = writeFakeBin("#!/bin/sh\nexit 42\n");
    let received: number | null | undefined;
    const handle = startLitestreamReplicate({
      binPath: bin,
      configPath: "/tmp/x.yml",
      logger: silentLogger,
      onExit: (code) => {
        received = code;
      },
    });
    for (let i = 0; i < 50 && received === undefined; i++) {
      await Bun.sleep(20);
    }
    expect(received).toBe(42);
    await handle.stop();
  });

  test("onExit does NOT fire when child is killed via stop()", async () => {
    const bin = writeFakeBin(
      "#!/bin/sh\ntrap 'exit 0' TERM\nwhile true; do sleep 0.1; done\n",
    );
    let received: number | null | undefined;
    const handle = startLitestreamReplicate({
      binPath: bin,
      configPath: "/tmp/x.yml",
      logger: silentLogger,
      onExit: (code) => {
        received = code;
      },
    });
    await handle.stop();
    await Bun.sleep(50);
    expect(received).toBeUndefined();
  });
});
